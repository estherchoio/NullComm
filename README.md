# NullComm

NullComm is a privacy-first messaging DApp that uses Zama FHEVM to keep message keys confidential on-chain while storing only encrypted message payloads. Senders encrypt messages locally with an ephemeral EVM address, encrypt that address with FHE, and let only the recipient decrypt the key and read the plaintext.

## At a glance

- Private key delivery on-chain using Zama FHE (the key never appears in plaintext on-chain)
- Message ciphertext stored on-chain, decrypted only client-side
- Sender-controlled ephemeral keys for each message
- Frontend uses viem for reads and ethers for writes
- Designed for Sepolia and FHEVM-compatible networks

## Problem statement

Traditional on-chain messaging either exposes plaintext or requires off-chain key exchange. That creates one of the following tradeoffs:

- Public messages are visible to everyone and cannot be retroactively secured.
- Off-chain key exchange introduces trust, availability, and UX challenges.
- Encrypting data on-chain without a secure key-delivery mechanism still exposes keys or requires central servers.

NullComm solves this by placing only the encrypted key on-chain via FHE and leaving the message encrypted end-to-end on the client.

## Solution overview

NullComm uses a two-part encryption strategy:

1. The message is encrypted locally with AES-256-GCM, using a key derived from an ephemeral EVM address.
2. The ephemeral address is encrypted on-chain with Zama FHE, so only the intended recipient can decrypt the key.

This allows trustless, on-chain delivery of the decryption key without exposing it to the network.

## Advantages

- Strong privacy for message content with no plaintext stored on-chain
- Trustless key delivery using FHE access control
- Per-message keys limit blast radius if a key is ever compromised
- Minimal on-chain footprint (ciphertext, encrypted key, sender, timestamp)
- Works with standard EVM wallets and a familiar web3 flow

## How it works (message flow)

1. Sender enters a message in the UI.
2. The app generates a random ephemeral EVM address A.
3. The message is encrypted with AES-256-GCM using a key derived from A (SHA-256 of the address bytes).
4. A is encrypted via Zama FHE and sent to the contract along with the ciphertext.
5. The contract stores the encrypted message and encrypted key, and grants the recipient permission to decrypt the key.
6. The recipient reads the message, decrypts the encrypted key using the Zama relayer, and then decrypts the message locally.

## Architecture

### On-chain

- `EncryptedMessenger` stores:
  - sender address
  - recipient-scoped array of encrypted messages
  - FHE-encrypted key (`eaddress`)
  - timestamp
- FHE access control allows only the recipient to decrypt the key.

### Frontend

- React + Vite UI (`app/`)
- viem for contract reads and ethers for writes
- Zama relayer SDK for decrypting FHE data
- No local storage of sensitive keys or messages

### Off-chain cryptography

- AES-256-GCM for message encryption
- SHA-256 of an ephemeral address to derive the AES key
- Decryption happens locally after key recovery

## Security and privacy model

- Private:
  - plaintext message
  - ephemeral key address A
- Public:
  - sender address
  - recipient address
  - ciphertext
  - timestamp
  - message ordering
- The encrypted key can only be decrypted by the recipient due to FHE access control.
- If the recipient's wallet is compromised, the attacker could decrypt messages for that wallet.
- Metadata privacy (who talks to whom and when) is not hidden in the current design.

## Tech stack

### Smart contracts

- Solidity 0.8.24
- Zama FHEVM libraries
- Hardhat + hardhat-deploy
- TypeChain

### Frontend

- React 19 + Vite
- viem (reads)
- ethers v6 (writes)
- wagmi + RainbowKit
- @zama-fhe/relayer-sdk

### Tooling

- TypeScript
- ESLint
- Mocha + Chai

## Project structure

```
.
├── app/                   # React frontend
├── contracts/             # Solidity contracts
├── deploy/                # Deployment scripts
├── deployments/           # Deployment artifacts and ABIs
├── docs/                  # Zama integration notes
├── tasks/                 # Hardhat tasks
├── test/                  # Hardhat test suites
├── hardhat.config.ts
└── README.md
```

## Setup and usage

### Prerequisites

- Node.js 20+
- npm
- A Sepolia-funded wallet

### Install dependencies

```bash
npm install
cd app
npm install
```

### Configure deployment

Create a `.env` file in the repository root with:

- `PRIVATE_KEY` (no 0x prefix)
- `INFURA_API_KEY`
- `ETHERSCAN_API_KEY` (optional)

Only private-key based deployment is supported. Do not use a mnemonic.

### Compile and test (local)

```bash
npm run compile
npm run test
```

### Deploy to a local FHEVM-ready node

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

### Deploy to Sepolia

```bash
npx hardhat deploy --network sepolia
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

### Run Sepolia test suite

```bash
npx hardhat test --network sepolia
```

## Frontend setup

1. Update WalletConnect project ID:
   - Edit `app/src/config/wagmi.ts` and replace `YOUR_PROJECT_ID`.
2. Set the contract address and ABI:
   - Copy the ABI from `deployments/sepolia/EncryptedMessenger.json` into `app/src/config/contracts.ts`.
   - Update `CONTRACT_ADDRESS` in `app/src/config/contracts.ts`.
3. Start the frontend:

```bash
cd app
npm run dev
```

The frontend connects to Sepolia and uses viem for reads and ethers for writes.

## Hardhat tasks

Useful tasks are defined in `tasks/EncryptedMessenger.ts`:

```bash
npx hardhat --network sepolia task:address
npx hardhat --network sepolia task:send-message --recipient 0x... --message "Hello"
npx hardhat --network sepolia task:message-count --recipient 0x...
npx hardhat --network sepolia task:message-at --recipient 0x... --index 0
npx hardhat --network sepolia task:decrypt-message --recipient 0x... --index 0
```

## Operational notes

- The encrypted payload format is `iv.ciphertext.tag`, each part base64 encoded.
- Message content is encrypted locally and never leaves the browser unencrypted.
- On-chain data is immutable; deleting or revoking access is out of scope.

## Future roadmap

- Optional off-chain storage for large payloads with on-chain hashes
- Group messaging with per-recipient encrypted keys
- Better metadata privacy (stealth recipients or relay layers)
- Message expiration policies with on-chain pointers
- Multi-device key access and account recovery flows
- UI improvements for message threading and search

## License

BSD-3-Clause-Clear. See `LICENSE`.
