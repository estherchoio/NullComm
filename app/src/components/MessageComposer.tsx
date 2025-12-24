import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Contract } from 'ethers';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import {
  encryptMessage,
  generateEphemeralAddress,
  isValidAddress,
  normalizeAddress,
} from '../utils/crypto';
import '../styles/MessageComposer.css';

// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

type MessageComposerProps = {
  onSent?: () => void;
};

export function MessageComposer({ onSent }: MessageComposerProps) {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string>('');

  const isConfigured = true;
  const canSend = !!address && !!signerPromise && !!instance && !zamaLoading && isConfigured;

  const handleSend = async () => {
    setError(null);
    setLastTxHash('');

    if (!isConfigured) {
      setError('Contract address is not configured yet.');
      return;
    }

    if (!address) {
      setError('Connect your wallet to send a message.');
      return;
    }

    if (!instance || !signerPromise) {
      setError('Encryption service is still loading.');
      return;
    }

    if (!recipient || !isValidAddress(recipient)) {
      setError('Enter a valid recipient address.');
      return;
    }

    if (!message.trim()) {
      setError('Message text cannot be empty.');
      return;
    }

    setIsSending(true);

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available.');
      }

      setStatus('Generating one-time address...');
      const ephemeralAddress = generateEphemeralAddress();

      setStatus('Encrypting message...');
      const encryptedMessage = await encryptMessage(message.trim(), ephemeralAddress);

      setStatus('Encrypting address key with Zama...');
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.addAddress(ephemeralAddress);
      const encryptedInput = await input.encrypt();

      setStatus('Sending transaction...');
      const messenger = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await messenger.sendMessage(
        normalizeAddress(recipient),
        encryptedMessage,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );

      setStatus('Waiting for confirmation...');
      const receipt = await tx.wait();
      setLastTxHash(receipt?.hash ?? tx.hash);

      setStatus('Message sent.');
      setMessage('');
      setRecipient('');
      onSent?.();
    } catch (err) {
      console.error('Failed to send message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message.');
      setStatus('');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="composer-card">
      <div className="composer-header">
        <h3>Send a message</h3>
        <p>Encrypt content with a random address key before sending.</p>
      </div>

      <div className="composer-body">
        <label className="field-label" htmlFor="recipient">
          Recipient address
        </label>
        <input
          id="recipient"
          className="text-input"
          type="text"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="0x..."
        />

        <label className="field-label" htmlFor="message">
          Message
        </label>
        <textarea
          id="message"
          className="text-area"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Write something only the recipient can read"
          rows={5}
        />

        {zamaError && <p className="helper-text error">{zamaError}</p>}
        {error && <p className="helper-text error">{error}</p>}
        {status && <p className="helper-text">{status}</p>}
        {lastTxHash && (
          <p className="helper-text success">Tx: {lastTxHash.slice(0, 10)}...{lastTxHash.slice(-8)}</p>
        )}

        <button
          className="primary-button"
          type="button"
          onClick={handleSend}
          disabled={!canSend || isSending}
        >
          {isSending ? 'Sending...' : 'Encrypt & Send'}
        </button>

        {!address && <p className="helper-text">Connect your wallet to start sending.</p>}
        {address && !isConfigured && (
          <p className="helper-text">Set the deployed contract address to enable messaging.</p>
        )}
      </div>
    </div>
  );
}
