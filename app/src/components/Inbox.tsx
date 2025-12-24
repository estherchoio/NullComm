import { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { decryptMessage, normalizeDecryptedAddress } from '../utils/crypto';
import '../styles/Inbox.css';

// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

type InboxProps = {
  refreshToken: number;
};

type MessageItem = {
  index: number;
  sender: string;
  encryptedMessage: string;
  encryptedKey: `0x${string}`;
  timestamp: bigint;
  decryptedMessage?: string;
  decryptedKey?: string;
  decrypting?: boolean;
};

export function Inbox({ refreshToken }: InboxProps) {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const publicClient = usePublicClient();
  const { instance } = useZamaInstance();

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = true;

  const { data: countData, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getMessageCount',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConfigured,
    },
  });

  useEffect(() => {
    let mounted = true;

    const loadMessages = async () => {
      if (!address || !publicClient || !isConfigured) {
        return;
      }

      const count = countData ? Number(countData) : 0;
      if (!Number.isFinite(count) || count <= 0) {
        if (mounted) {
          setMessages([]);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const indices = Array.from({ length: count }, (_, index) => index);
        const results = await Promise.all(
          indices.map(async (index) => {
            const data = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'getMessageAt',
              args: [address, BigInt(index)],
            });

            const [sender, encryptedMessage, encryptedKey, timestamp] = data as [
              string,
              string,
              `0x${string}`,
              bigint,
            ];

            return {
              index,
              sender,
              encryptedMessage,
              encryptedKey,
              timestamp,
            } as MessageItem;
          }),
        );

        if (mounted) {
          setMessages(results.reverse());
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
        if (mounted) {
          setError('Failed to load messages.');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadMessages();

    return () => {
      mounted = false;
    };
  }, [address, publicClient, countData, refreshToken, isConfigured]);

  const handleDecrypt = async (item: MessageItem) => {
    if (!address || !instance || !signerPromise) {
      setError('Connect your wallet to decrypt messages.');
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.index === item.index ? { ...message, decrypting: true } : message,
      ),
    );

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available.');
      }

      const keypair = instance.generateKeypair();
      const handleContractPairs = [
        {
          handle: item.encryptedKey,
          contractAddress: CONTRACT_ADDRESS,
        },
      ];

      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [CONTRACT_ADDRESS];

      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays,
      );

      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const rawKey = result[item.encryptedKey];
      if (rawKey === undefined) {
        throw new Error('Failed to retrieve decrypted key.');
      }
      const decryptedKey = normalizeDecryptedAddress(rawKey as string | bigint);
      const decryptedMessage = await decryptMessage(item.encryptedMessage, decryptedKey);

      setMessages((current) =>
        current.map((message) =>
          message.index === item.index
            ? { ...message, decryptedKey, decryptedMessage, decrypting: false }
            : message,
        ),
      );
      setError(null);
    } catch (err) {
      console.error('Failed to decrypt message:', err);
      setError(err instanceof Error ? err.message : 'Failed to decrypt message.');
      setMessages((current) =>
        current.map((message) =>
          message.index === item.index ? { ...message, decrypting: false } : message,
        ),
      );
    }
  };

  useEffect(() => {
    if (address && isConfigured) {
      refetch();
    }
  }, [address, refreshToken, isConfigured, refetch]);

  return (
    <div className="inbox-card">
      <div className="inbox-header">
        <h3>Inbox</h3>
        <p>Decrypt keys with Zama to reveal message content.</p>
      </div>

      {!address && <p className="helper-text">Connect your wallet to view messages.</p>}
      {address && !isConfigured && (
        <p className="helper-text">Set the deployed contract address to enable the inbox.</p>
      )}
      {error && <p className="helper-text error">{error}</p>}
      {isLoading && <p className="helper-text">Loading messages...</p>}

      {address && isConfigured && !isLoading && messages.length === 0 && (
        <div className="empty-state">
          <p>No messages yet.</p>
          <span>Share your address to receive encrypted notes.</span>
        </div>
      )}

      <div className="message-list">
        {messages.map((item) => {
          const date = new Date(Number(item.timestamp) * 1000);
          return (
            <div key={item.index} className="message-item">
              <div className="message-meta">
                <span>From {item.sender.slice(0, 6)}...{item.sender.slice(-4)}</span>
                <span>{date.toLocaleString()}</span>
              </div>
              <div className="message-body">
                {item.decryptedMessage ? (
                  <p className="message-text">{item.decryptedMessage}</p>
                ) : (
                  <p className="message-placeholder">Encrypted payload stored on-chain.</p>
                )}
              </div>

              <div className="message-actions">
                {item.decryptedKey && (
                  <span className="helper-text">Key: {item.decryptedKey.slice(0, 8)}...{item.decryptedKey.slice(-6)}</span>
                )}
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => handleDecrypt(item)}
                  disabled={item.decrypting}
                >
                  {item.decrypting ? 'Decrypting...' : item.decryptedMessage ? 'Decrypt again' : 'Decrypt message'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
