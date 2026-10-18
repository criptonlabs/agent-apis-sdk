export interface PaymentOption {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}
export type PaymentOptionSummary = Pick<PaymentOption, "network" | "asset" | "amount" | "payTo">;
