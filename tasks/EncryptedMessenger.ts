import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getAddress } from "ethers";

function deriveKeyFromAddress(address: string): Buffer {
  const normalized = getAddress(address);
  const addressBytes = Buffer.from(normalized.slice(2), "hex");
  return createHash("sha256").update(addressBytes).digest();
}

function encryptMessageWithAddress(message: string, address: string): string {
  const key = deriveKeyFromAddress(address);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(message, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${ciphertext.toString("base64")}.${tag.toString("base64")}`;
}

function decryptMessageWithAddress(payload: string, address: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted message payload");
  }

  const [ivB64, cipherB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");
  const tag = Buffer.from(tagB64, "base64");

  const key = deriveKeyFromAddress(address);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

function normalizeDecryptedAddress(value: bigint | string): string {
  if (typeof value === "string") {
    return getAddress(value.startsWith("0x") ? value : `0x${value}`);
  }
  const hex = value.toString(16).padStart(40, "0");
  return getAddress(`0x${hex}`);
}

/**
 * Example:
 *   - npx hardhat --network sepolia task:address
 */
task("task:address", "Prints the EncryptedMessenger address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const messenger = await deployments.get("EncryptedMessenger");
  console.log("EncryptedMessenger address is " + messenger.address);
});

/**
 * Example:
 *   - npx hardhat --network sepolia task:send-message --recipient 0x... --message "Hello"
 */
task("task:send-message", "Sends an encrypted message")
  .addParam("recipient", "Recipient address")
  .addParam("message", "Plaintext message")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, fhevm, ethers } = hre;

    await fhevm.initializeCLIApi();

    const messenger = await deployments.get("EncryptedMessenger");
    const signers = await ethers.getSigners();
    const sender = signers[0];
    const recipient = getAddress(taskArguments.recipient);

    const ephemeralAddress = ethers.Wallet.createRandom().address;
    const encryptedMessage = encryptMessageWithAddress(taskArguments.message, ephemeralAddress);

    const encryptedInput = await fhevm
      .createEncryptedInput(messenger.address, sender.address)
      .addAddress(ephemeralAddress)
      .encrypt();

    const messengerContract = await ethers.getContractAt("EncryptedMessenger", messenger.address);
    const tx = await messengerContract
      .connect(sender)
      .sendMessage(recipient, encryptedMessage, encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx: ${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:message-count --recipient 0x...
 */
task("task:message-count", "Reads message count")
  .addParam("recipient", "Recipient address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const messenger = await deployments.get("EncryptedMessenger");
    const messengerContract = await ethers.getContractAt("EncryptedMessenger", messenger.address);
    const recipient = getAddress(taskArguments.recipient);
    const count = await messengerContract.getMessageCount(recipient);
    console.log(`Message count for ${recipient}: ${count}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:message-at --recipient 0x... --index 0
 */
task("task:message-at", "Reads a message by index")
  .addParam("recipient", "Recipient address")
  .addParam("index", "Message index")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const messenger = await deployments.get("EncryptedMessenger");
    const messengerContract = await ethers.getContractAt("EncryptedMessenger", messenger.address);
    const recipient = getAddress(taskArguments.recipient);
    const index = parseInt(taskArguments.index);
    const message = await messengerContract.getMessageAt(recipient, index);
    console.log(`Sender: ${message[0]}`);
    console.log(`Encrypted message: ${message[1]}`);
    console.log(`Encrypted key: ${message[2]}`);
    console.log(`Timestamp: ${message[3]}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:decrypt-message --recipient 0x... --index 0
 */
task("task:decrypt-message", "Decrypts a message for the recipient")
  .addParam("recipient", "Recipient address")
  .addParam("index", "Message index")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, fhevm, ethers } = hre;

    await fhevm.initializeCLIApi();

    const messenger = await deployments.get("EncryptedMessenger");
    const messengerContract = await ethers.getContractAt("EncryptedMessenger", messenger.address);
    const recipient = getAddress(taskArguments.recipient);

    const signers = await ethers.getSigners();
    const recipientSigner = signers[0];

    if (recipientSigner.address.toLowerCase() !== recipient.toLowerCase()) {
      throw new Error("Signer must match the recipient address");
    }

    const index = parseInt(taskArguments.index);
    const message = await messengerContract.getMessageAt(recipient, index);
    const encryptedKey = message[2];

    const clearKey = await fhevm.userDecryptEuint(
      FhevmType.eaddress,
      encryptedKey,
      messenger.address,
      recipientSigner,
    );

    const clearAddress = normalizeDecryptedAddress(clearKey);
    const plaintext = decryptMessageWithAddress(message[1], clearAddress);

    console.log(`Decrypted key address: ${clearAddress}`);
    console.log(`Plaintext message: ${plaintext}`);
  });
