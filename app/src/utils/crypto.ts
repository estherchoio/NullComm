import { ethers } from 'ethers';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKeyFromAddress(address: string): Promise<CryptoKey> {
  const normalized = ethers.getAddress(address);
  const addressBytes = hexToBytes(normalized.slice(2));
  const hash = await crypto.subtle.digest('SHA-256', addressBytes);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function generateEphemeralAddress(): string {
  return ethers.Wallet.createRandom().address;
}

export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}

export function normalizeAddress(address: string): string {
  return ethers.getAddress(address);
}

export function normalizeDecryptedAddress(value: string | bigint): string {
  if (typeof value === 'string') {
    return normalizeAddress(value.startsWith('0x') ? value : `0x${value}`);
  }
  const hex = value.toString(16).padStart(40, '0');
  return normalizeAddress(`0x${hex}`);
}

export async function encryptMessage(message: string, address: string): Promise<string> {
  const key = await deriveKeyFromAddress(address);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = textEncoder.encode(message);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  const tagLength = 16;
  const data = encrypted.slice(0, encrypted.length - tagLength);
  const tag = encrypted.slice(encrypted.length - tagLength);

  return `${bytesToBase64(iv)}.${bytesToBase64(data)}.${bytesToBase64(tag)}`;
}

export async function decryptMessage(payload: string, address: string): Promise<string> {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted message payload');
  }

  const [ivB64, dataB64, tagB64] = parts;
  const iv = base64ToBytes(ivB64);
  const data = base64ToBytes(dataB64);
  const tag = base64ToBytes(tagB64);
  const combined = new Uint8Array(data.length + tag.length);
  combined.set(data);
  combined.set(tag, data.length);

  const key = await deriveKeyFromAddress(address);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);
  return textDecoder.decode(decrypted);
}
