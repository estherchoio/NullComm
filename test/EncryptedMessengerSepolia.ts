import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { EncryptedMessenger } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

type Signers = {
  alice: HardhatEthersSigner;
};

function deriveKeyFromAddress(address: string): Buffer {
  const normalized = ethers.getAddress(address);
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
    return ethers.getAddress(value.startsWith("0x") ? value : `0x${value}`);
  }
  const hex = value.toString(16).padStart(40, "0");
  return ethers.getAddress(`0x${hex}`);
}

describe("EncryptedMessengerSepolia", function () {
  let signers: Signers;
  let messenger: EncryptedMessenger;
  let messengerAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn("This hardhat test suite can only run on Sepolia Testnet");
      this.skip();
    }

    try {
      const deployment = await deployments.get("EncryptedMessenger");
      messengerAddress = deployment.address;
      messenger = await ethers.getContractAt("EncryptedMessenger", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("sends and decrypts a message", async function () {
    steps = 9;
    this.timeout(4 * 40000);

    const plaintext = "Sepolia relay check";
    const keyAddress = ethers.Wallet.createRandom().address;
    const encryptedMessage = encryptMessageWithAddress(plaintext, keyAddress);

    progress("Encrypting address key...");
    const encryptedInput = await fhevm
      .createEncryptedInput(messengerAddress, signers.alice.address)
      .addAddress(keyAddress)
      .encrypt();

    progress("Sending encrypted message...");
    const tx = await messenger
      .connect(signers.alice)
      .sendMessage(signers.alice.address, encryptedMessage, encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    progress("Reading message count...");
    const count = await messenger.getMessageCount(signers.alice.address);
    expect(count).to.be.greaterThan(0n);

    const index = count - 1n;
    progress("Reading latest message...");
    const stored = await messenger.getMessageAt(signers.alice.address, Number(index));

    progress("Decrypting address key...");
    const clearKey = await fhevm.userDecryptEuint(
      FhevmType.eaddress,
      stored[2],
      messengerAddress,
      signers.alice,
    );
    const clearAddress = normalizeDecryptedAddress(clearKey);

    progress("Decrypting ciphertext...");
    const decryptedMessage = decryptMessageWithAddress(stored[1], clearAddress);

    expect(decryptedMessage).to.eq(plaintext);
  });
});
