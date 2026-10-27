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

export interface KitResponse<T> {
  data: T;
  receipt: PaymentReceipt | null;
}

export interface NetworkDescriptor {
  network: string;
  productToken: string;
  routeTimeoutsMs?: Record<string, number>;
}

export interface PaymentConfig {
  payer: X402Payer;
  maxPerCall: string;
  sessionBudget?: string;
}

export interface KitConfig {
  baseUrl?: string;
  tier?: "free" | "pro";
  timeoutMs?: number;
  transport?: Transport;
  payment?: PaymentConfig;
}
