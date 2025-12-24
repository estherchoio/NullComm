import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { EncryptedMessenger, EncryptedMessenger__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
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

async function deployFixture() {
  const factory = (await ethers.getContractFactory("EncryptedMessenger")) as EncryptedMessenger__factory;
  const messenger = (await factory.deploy()) as EncryptedMessenger;
  const messengerAddress = await messenger.getAddress();

  return { messenger, messengerAddress };
}

describe("EncryptedMessenger", function () {
  let signers: Signers;
  let messenger: EncryptedMessenger;
  let messengerAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This hardhat test suite cannot run on Sepolia Testnet");
      this.skip();
    }

    ({ messenger, messengerAddress } = await deployFixture());
  });

  it("stores encrypted messages and lets recipients decrypt keys", async function () {
    const plaintext = "Meet at the blue station.";
    const keyAddress = ethers.getAddress("0x1111111111111111111111111111111111111111");
    const encryptedMessage = encryptMessageWithAddress(plaintext, keyAddress);

    const encryptedInput = await fhevm
      .createEncryptedInput(messengerAddress, signers.alice.address)
      .addAddress(keyAddress)
      .encrypt();

    const tx = await messenger
      .connect(signers.alice)
      .sendMessage(signers.bob.address, encryptedMessage, encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    const count = await messenger.getMessageCount(signers.bob.address);
    expect(count).to.eq(1n);

    const stored = await messenger.getMessageAt(signers.bob.address, 0);
    expect(stored[0]).to.eq(signers.alice.address);
    expect(stored[1]).to.eq(encryptedMessage);

    const clearKey = await fhevm.userDecryptEuint(
      FhevmType.eaddress,
      stored[2],
      messengerAddress,
      signers.bob,
    );
    const clearAddress = normalizeDecryptedAddress(clearKey);
    const decryptedMessage = decryptMessageWithAddress(stored[1], clearAddress);

    expect(decryptedMessage).to.eq(plaintext);
  });
});
