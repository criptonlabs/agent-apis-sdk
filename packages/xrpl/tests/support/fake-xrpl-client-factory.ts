import type { XrplClientFactory } from "@x402/xrpl";
import type { Client } from "xrpl";

export interface FakeXrplClientFactory {
  factory: XrplClientFactory;
  /** Every ws URL a client was created for. */
  readonly wsUrls: string[];
  /** Commands passed to `request`. */
  readonly requests: string[];
  /** Every submit-type call (submit, submitAndWait, submitReliable, request command submit*). */
  readonly submissions: string[];
  /** Every other client method call. */
  readonly calls: string[];
}

/** Answers connect, getLedgerIndex, autofill and account_objects with plausible testnet data; records submissions. */
export function createFakeXrplClientFactory(
  options: {
    ticketSequences?: number[];
    /** When given, every autofill (one per signing) appends `"sign"` to it. */
    events?: string[];
  } = {},
): FakeXrplClientFactory {
  const wsUrls: string[] = [];
  const requests: string[] = [];
  const submissions: string[] = [];
  const calls: string[] = [];
  const tickets = options.ticketSequences ?? [];

  const handlers: Record<string, (...args: unknown[]) => unknown> = {
    connect: async () => undefined,
    disconnect: async () => undefined,
    isConnected: () => true,
    getLedgerIndex: async () => 14_000_000,
    autofill: async (tx: unknown) => {
      options.events?.push("sign");
      const payment = tx as Record<string, unknown>;
      const ticket = payment.TicketSequence !== undefined;
      return {
        ...payment,
        Fee: payment.Fee ?? "12",
        Sequence: ticket ? 0 : 4_200_000,
        LastLedgerSequence: payment.LastLedgerSequence ?? 14_000_020,
      };
    },
    request: async (req: unknown) => {
      const command = String((req as { command?: string }).command);
      requests.push(command);
      if (command.startsWith("submit")) submissions.push(`request:${command}`);
      if (command === "account_objects") {
        return {
          result: {
            account_objects: tickets.map((n) => ({
              LedgerEntryType: "Ticket",
              TicketSequence: n,
            })),
          },
        };
      }
      return { result: {} };
    },
  };

  const factory: XrplClientFactory = (wsUrl) => {
    wsUrls.push(wsUrl);
    const client = new Proxy(
      {},
      {
        get(_target, property) {
          const name = String(property);
          const handler = handlers[name];
          if (handler) return handler;
          return async (...args: unknown[]) => {
            void args;
            if (name.startsWith("submit")) submissions.push(name);
            else calls.push(name);
            return { result: {} };
          };
        },
      },
    );
    return client as unknown as Client;
  };

  return { factory, wsUrls, requests, submissions, calls };
}
