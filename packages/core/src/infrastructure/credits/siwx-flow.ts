import { decodePaymentRequiredHeader } from "@x402/core/http";
import { z } from "zod";
import type { Clock, RotationResult, SiwxSigner } from "../../application/ports.js";
import {
  CriptonPaymentError,
  CriptonResponseError,
  type CriptonKitError,
} from "../../domain/errors.js";
import {
  assertBound,
  challengeForChain,
  isExpired,
  parseNextChallenge,
  renewed,
  type NextChallenge,
  type SiwxChallengeFields,
} from "../../domain/siwx-challenge.js";
import { parseProblem, readJson, signalsOf } from "../http/problem.js";
import { withHiddenToken } from "./topup.js";

/** The request header that carries a SIWX proof. */
const SIWX_HEADER = "SIGN-IN-WITH-X";
const NEXT_CHALLENGE_HEADER = "x-siwx-next-challenge";
/** The credit refusal of a SIWX proof (API `prepaid-credits`). */
const SIWX_INVALID = "siwx_invalid";

/** The 201 body of a rotation: one new credit token (API `prepaid-credits` "Token rotation"). */
const rotatedBody = z.object({ token: z.string() });

/** Sends one request with the given extra headers. */
export type SiwxSend = (headers: Record<string, string>) => Promise<Response>;

/** Who signs SIWX proofs, the API origin they are bound to, and the clock of the kept challenges. */
export interface SiwxPort {
  signer: SiwxSigner;
  clock: Clock;
  baseUrl: string;
}

/** One data request: its URL, the headers that go only with a proof (the idempotency key), its sender. */
export interface SiwxRequest {
  url: string;
  proofHeaders: Record<string, string>;
  send: SiwxSend;
}

/** How a rotation reaches the API: `POST <base>/v1/pro/credits/token`, never with a token or payment. */
export interface RotationPort {
  signer: SiwxSigner;
  baseUrl: string;
  url: string;
  send: SiwxSend;
}

/** A next challenge kept for one request path, with the challenge it renews. */
interface KeptChallenge {
  challenge: SiwxChallengeFields;
  next: NextChallenge;
}

/** The 402's `sign-in-with-x` challenge for the signer's chain, read from `PAYMENT-REQUIRED`. */
function challengeOf(response: Response, chainId: string): SiwxChallengeFields | undefined {
  const header = response.status === 402 ? response.headers.get("payment-required") : null;
  if (header === null) return undefined;
  try {
    return challengeForChain(decodePaymentRequiredHeader(header).extensions, chainId);
  } catch {
    // An unreadable challenge is left to the payment flow, which reports it.
    return undefined;
  }
}

/** A `siwx_invalid` refusal, read from a copy so the payment flow can still read the body. */
async function isProofRefused(response: Response): Promise<boolean> {
  if (response.status !== 402) return false;
  return signalsOf(await readJson(response.clone())).reason === SIWX_INVALID;
}

/**
 * SIWX spending on data requests (design D9). A request is signed up front with its path's kept
 * next challenge (single use, discarded when expired), and a `siwx_invalid` refusal of that proof
 * is answered once with the refusal's fresh challenge. Otherwise the request goes without
 * credentials and a 402 challenge for the signer's chain is answered once. Every other answer is
 * returned as is to the existing paths (credit refusal, `credits-required`, per-call payment).
 */
export class SiwxSpending {
  readonly #kept = new Map<string, KeptChallenge>();

  constructor(private readonly port: SiwxPort) {}

  async send(request: SiwxRequest): Promise<Response> {
    const path = new URL(request.url).pathname;
    const kept = this.take(path);
    if (kept === undefined) return this.answer(await request.send({}), request, path);
    const response = await this.prove(kept, request, path);
    if (!(await isProofRefused(response))) return response;
    return this.answer(response, request, path);
  }

  /** The path's kept next challenge, removed whether used or expired. */
  private take(path: string): SiwxChallengeFields | undefined {
    const kept = this.#kept.get(path);
    this.#kept.delete(path);
    if (kept === undefined || isExpired(kept.next, this.port.clock.nowMs())) return undefined;
    return renewed(kept.challenge, kept.next);
  }

  /** Answers the 402's challenge for the signer's chain once; any other answer is returned as is. */
  private async answer(response: Response, request: SiwxRequest, path: string): Promise<Response> {
    const challenge = challengeOf(response, this.port.signer.chainId);
    if (challenge === undefined) return response;
    return this.prove(challenge, request, path);
  }

  /** Signs a bound challenge and sends the request once with the proof. */
  private async prove(
    challenge: SiwxChallengeFields,
    request: SiwxRequest,
    path: string,
  ): Promise<Response> {
    assertBound(challenge, this.port.baseUrl, request.url);
    const proof = await this.port.signer.proofHeader(challenge, request.url);
    const response = await request.send({ ...request.proofHeaders, [SIWX_HEADER]: proof });
    this.keep(path, challenge, response);
    return response;
  }

  /** Keeps the next challenge of a SIWX-debited answer for the same path, then prunes. */
  private keep(path: string, challenge: SiwxChallengeFields, response: Response): void {
    if (!response.ok) return;
    const next = parseNextChallenge(response.headers.get(NEXT_CHALLENGE_HEADER));
    if (next === null) return;
    this.#kept.set(path, { challenge, next });
    this.prune();
  }

  /** Drops every kept challenge whose `expirationTime` has passed by the kit clock (review S4). */
  private prune(): void {
    const nowMs = this.port.clock.nowMs();
    for (const [path, kept] of this.#kept) {
      if (isExpired(kept.next, nowMs)) this.#kept.delete(path);
    }
  }
}

async function rotatedToken(response: Response): Promise<string> {
  const parsed = rotatedBody.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new CriptonResponseError("Rotation response does not match the expected schema");
  }
  return parsed.data.token;
}

/**
 * A refused signed rotation, classified by its reason first: a `siwx_invalid` refusal is the API
 * problem as is, also with a prepaid offer (review S2); another 402 carrying the prepaid offer (a
 * wallet without credits) is `credits-required` with the offer; any other refusal is the problem.
 */
async function rotationRefusal(response: Response): Promise<CriptonKitError> {
  const problem = await parseProblem(response);
  const { prepaidOffer, reason } = problem;
  if (reason === SIWX_INVALID) return problem;
  if (problem.status !== 402 || prepaidOffer === undefined) return problem;
  return new CriptonPaymentError("credits-required", [], {
    prepaidOffer,
    ...(reason !== undefined ? { reason } : {}),
  });
}

/**
 * Rotates the wallet's credit tokens (design D10): the unsigned POST, its rotation challenge
 * answered once with the wallet's signer, and the 201 token, whose JSON and inspected forms show
 * `[redacted]`. Never debits and never sends a token or a payment.
 */
export async function rotateCreditToken(port: RotationPort): Promise<RotationResult> {
  const first = await port.send({});
  const challenge = challengeOf(first, port.signer.chainId);
  if (challenge === undefined) throw await parseProblem(first);
  assertBound(challenge, port.baseUrl, port.url);
  const proof = await port.signer.proofHeader(challenge, port.url);
  const created = await port.send({ [SIWX_HEADER]: proof });
  if (!created.ok) throw await rotationRefusal(created);
  return withHiddenToken({}, await rotatedToken(created));
}
