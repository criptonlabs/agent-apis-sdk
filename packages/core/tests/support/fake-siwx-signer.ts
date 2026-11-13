import type { SiwxChallenge, SiwxSigner } from "../../src/application/ports.js";
import { SOLANA_DEVNET } from "./credit-fixtures.js";

/** One `proofHeader` call: the challenge answered and the URL of the request it signs. */
export interface SiwxSignerCall {
  challenge: SiwxChallenge;
  requestUrl: string;
}

/** The deterministic `SIGN-IN-WITH-X` value of the fake signer: it encodes the nonce it signed. */
export const fakeSiwxProof = (nonce: string): string => `fake-siwx:${nonce}`;

/** SIWX signer of a fixed chain (devnet by default); records every challenge, holds no key. */
export class FakeSiwxSigner implements SiwxSigner {
  readonly calls: SiwxSignerCall[] = [];

  constructor(readonly chainId: string = SOLANA_DEVNET) {}

  proofHeader(challenge: SiwxChallenge, requestUrl: string): Promise<string> {
    this.calls.push({ challenge: { ...challenge }, requestUrl });
    return Promise.resolve(fakeSiwxProof(challenge.nonce));
  }
}
