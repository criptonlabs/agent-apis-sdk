import {
  CriptonValidationError,
  loadPeer,
  type PeerImporter,
  type SiwxChallenge,
  type SiwxSigner,
} from "@criptonlabs/agent-apis-core";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import { SOLANA_CAIP2, type SolanaNetworkName } from "../../domain/solana-assets.js";
import { parsePayerKey } from "../x402/payer-key.js";

/** The official x402 Sign-In-With-X client library (optional peer `@x402/extensions`, design D9). */
const SIWX_LIBRARY = "@x402/extensions/sign-in-with-x";

/**
 * Imports from this module, so the bare specifier resolves from the Solana package, which declares
 * the peer; the core does not, and a strict install would not let the core see it (design D9).
 */
const solanaImporter: PeerImporter = (specifier) => import(specifier);

export interface SolanaSiwxSignerConfig {
  key: string;
  network?: SolanaNetworkName;
  /** Test seam for the optional peer. */
  importer?: PeerImporter;
}

/** One chain's challenge as the library signs it: the challenge info with the Solana `siws` scheme. */
interface SiwsInfo extends Omit<SiwxChallenge, "chainId" | "type" | "signatureScheme"> {
  chainId: string;
  type: "ed25519";
  signatureScheme: "siws";
}

/** The SIWX proof the library builds; only passed back to the library to encode it. */
type SiwxProof = object;

/** The members of `@x402/extensions/sign-in-with-x` this signer uses. */
interface SiwxLibrary {
  createSIWxPayload(info: SiwsInfo, signer: KeyPairSigner, requestUrl: string): Promise<SiwxProof>;
  encodeSIWxHeader(payload: SiwxProof): string;
}

async function signerFrom(bytes: Uint8Array): Promise<KeyPairSigner> {
  try {
    return await createKeyPairSignerFromBytes(bytes);
  } catch {
    throw new CriptonValidationError("key", "key is not a valid Solana secret key");
  }
}

/**
 * The wallet's SIWX signer (design D9): Ed25519 `siws` proofs for the chain of its network, signed
 * locally with the wallet key. The SIWX library is loaded on the first proof, never before, and
 * the proof carries the wallet address and signature only, never the key.
 */
export function createSolanaSiwxSigner(config: SolanaSiwxSignerConfig): SiwxSigner {
  const bytes = parsePayerKey(config.key, "key");
  const chainId = SOLANA_CAIP2[config.network ?? "mainnet"];
  return {
    chainId,
    async proofHeader(challenge, requestUrl) {
      const library = await loadPeer<SiwxLibrary>(SIWX_LIBRARY, config.importer ?? solanaImporter);
      const signer = await signerFrom(bytes);
      const info: SiwsInfo = {
        ...challenge,
        chainId,
        type: "ed25519",
        signatureScheme: "siws",
      };
      return library.encodeSIWxHeader(await library.createSIWxPayload(info, signer, requestUrl));
    },
  };
}
