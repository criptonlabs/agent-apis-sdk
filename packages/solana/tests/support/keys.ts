import { generateKeyPairSync } from "node:crypto";
import { getBase58Decoder } from "@solana/kit";

export interface ThrowawayKey {
  /** 64-byte secret key (32-byte seed + 32-byte public key) as base58 text. */
  base58: string;
  /** The same 64 bytes as a JSON array of integers. */
  jsonArray: string;
  /** Base58 address of the public key. */
  address: string;
  bytes: Uint8Array;
}

const base58 = getBase58Decoder();

function jwkBytes(value: string | undefined): Uint8Array {
  return new Uint8Array(Buffer.from(value ?? "", "base64url"));
}

/** Generates an in-memory Ed25519 key pair for one test run; never written to disk. */
export function throwawayKey(): ThrowawayKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = jwkBytes(privateKey.export({ format: "jwk" }).d);
  const pub = jwkBytes(publicKey.export({ format: "jwk" }).x);
  const bytes = new Uint8Array(64);
  bytes.set(seed, 0);
  bytes.set(pub, 32);
  return {
    base58: base58.decode(bytes),
    jsonArray: JSON.stringify(Array.from(bytes)),
    address: base58.decode(pub),
    bytes,
  };
}

/** A fresh on-curve address nobody keeps the key of. */
export function throwawayAddress(): string {
  return throwawayKey().address;
}

/** Base58 text of arbitrary bytes (e.g. to build keys of the wrong length). */
export function toBase58(bytes: Uint8Array): string {
  return base58.decode(bytes);
}
