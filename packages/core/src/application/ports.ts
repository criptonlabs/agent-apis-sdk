import type { PaymentOption } from "../domain/payment-option.js";

export type Transport = (url: string, init: RequestInit) => Promise<Response>;

export interface X402Payer {
  selectOption(accepts: readonly PaymentOption[]): PaymentOption | null;
  createPaymentHeaders(
    paymentRequired: unknown,
    option: PaymentOption,
  ): Promise<Record<string, string>>;
  /** Decimal amount of the option in the asset's units; absent means `option.amount` already is. */
  decimalAmount?(option: PaymentOption): string;
}

export interface PaymentReceipt {
  transaction: string;
  network: string;
  asset: string;
  amount: string;
  payer?: string;
}

export interface Clock {
  nowMs(): number;
}

/** Denomination to decimal units. */
export type CreditBalance = Readonly<Record<string, string>>;

export interface CallOptions {
  idempotencyKey?: string;
}

export interface SiwxChallenge {
  domain: string;
  uri: string;
  version: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  statement?: string;
  chainId: string;
  type: string;
  signatureScheme?: string;
}

export interface SiwxSigner {
  /** CAIP-2 chain the wallet signs for. */
  readonly chainId: string;
  /** The SIGN-IN-WITH-X header value. */
  proofHeader(challenge: SiwxChallenge, requestUrl: string): Promise<string>;
}

export interface KitResponse<T> {
  data: T;
  receipt: PaymentReceipt | null;
  credits: CreditBalance | null;
  replayed: boolean;
}

export interface NetworkDescriptor {
  network: string;
  productToken: string;
  routeTimeoutsMs?: Record<string, number>;
}

/** Per-call payment opt-in; the payer is `KitConfig.wallet`. */
export interface PaymentConfig {
  maxPerCall: string;
  sessionBudget?: string;
}

export interface CreditsConfig {
  token?: string;
  /** The wallet's SIWX signer: rotation always, spending only with `siwxSpend`. */
  siwxSigner?: SiwxSigner;
  /** Answer sign-in-with-x challenges on data requests. */
  siwxSpend?: boolean;
  topupBudget?: string;
}

export interface TopupRequest {
  bundle: string;
  maxAmount: string;
}

export interface TopupResult {
  bundle: string;
  token: string;
  wallet: string | null;
  denomination: string | null;
  balance: string | null;
  lotExpiresAt: string | null;
  pending: boolean | null;
  receipt: PaymentReceipt | null;
  toJSON(): Omit<TopupResult, "token" | "toJSON"> & { token: "[redacted]" };
}

export interface RotationResult {
  token: string;
  toJSON(): { token: "[redacted]" };
}

export interface PriceIndexEntry {
  resource: string;
  mode: string;
  debit: CreditBalance | null;
  prices: readonly {
    amount: string;
    asset: string;
    network?: string;
    mint?: string;
    issuer?: string;
  }[];
}

export interface PriceIndex {
  paymentsMode: string | null;
  routes: readonly PriceIndexEntry[];
}

export interface CreditsApi {
  topup(request: TopupRequest): Promise<TopupResult>;
  lastKnownBalance(): CreditBalance | null;
  topupSpent(): string;
  hasToken(): boolean;
}

export interface KitConfig {
  baseUrl?: string;
  tier?: "free" | "pro";
  timeoutMs?: number;
  transport?: Transport;
  clock?: Clock;
  wallet?: X402Payer;
  payment?: PaymentConfig;
  credits?: CreditsConfig;
}
