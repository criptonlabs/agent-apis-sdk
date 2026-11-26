import type { X402Payer } from "../../src/application/ports.js";
import { CriptonPaymentError } from "../../src/domain/errors.js";
import type { PaymentOption } from "../../src/domain/payment-option.js";

type ExclusiveSection = <T>(task: () => Promise<T>) => Promise<T>;

export interface FakePayerOptions {
  selectOption?: (accepts: readonly PaymentOption[]) => PaymentOption | null;
  delayMs?: number;
  secret?: string;
  /** When given, the payer defines `decimalAmount`; absent means the method is not defined. */
  decimalAmount?: (option: PaymentOption) => string;
  /** When true, the payer defines `exclusive`, running its tasks one after another. */
  exclusive?: boolean;
  /**
   * When true, the payer defines `exclusive`, which rejects with `CriptonPaymentError`
   * `payment-busy` before running the task.
   */
  refuseStart?: boolean;
  /** The n-th `createPaymentHeaders` call throws the n-th entry, when that entry is defined. */
  signingErrors?: readonly unknown[];
  /** Event log shared with the test; the payer appends `"sign"` on every `createPaymentHeaders` call. */
  log?: string[];
}

/** Serializes tasks with a promise chain of its own; a task's failure never blocks the next one. */
function serialized(): ExclusiveSection {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task);
    chain = run.catch(() => undefined);
    return run;
  };
}

/** Rejects before running the task, so nothing is signed. */
const refusing: ExclusiveSection = () =>
  Promise.reject(new CriptonPaymentError("payment-busy", []));

/** Fixed-signature payer; records what it signed and never exposes its secret. */
export class FakePayer implements X402Payer {
  readonly signed: PaymentOption[] = [];
  readonly requirements: unknown[] = [];
  /** The order of `createPaymentHeaders` calls (`"sign"`), plus any events the test appends. */
  readonly log: string[];
  readonly #secret: string | undefined;
  readonly #select: (accepts: readonly PaymentOption[]) => PaymentOption | null;
  readonly #delayMs: number;
  readonly #signingErrors: readonly unknown[];
  #signings = 0;
  declare readonly decimalAmount?: (option: PaymentOption) => string;
  declare readonly exclusive?: ExclusiveSection;

  constructor(options: FakePayerOptions = {}) {
    this.#secret = options.secret;
    this.#select = options.selectOption ?? ((accepts) => accepts[0] ?? null);
    this.#delayMs = options.delayMs ?? 0;
    this.#signingErrors = options.signingErrors ?? [];
    this.log = options.log ?? [];
    if (options.decimalAmount) {
      Object.defineProperty(this, "decimalAmount", { value: options.decimalAmount });
    }
    const exclusive = exclusiveOf(options);
    if (exclusive) Object.defineProperty(this, "exclusive", { value: exclusive });
  }

  selectOption(accepts: readonly PaymentOption[]): PaymentOption | null {
    return this.#select(accepts);
  }

  async createPaymentHeaders(
    paymentRequired: unknown,
    option: PaymentOption,
  ): Promise<Record<string, string>> {
    this.log.push("sign");
    const failure = this.#signingErrors[this.#signings];
    this.#signings += 1;
    if (failure !== undefined) throw failure;
    if (this.#delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.#delayMs));
    this.requirements.push(paymentRequired);
    this.signed.push(option);
    void this.#secret;
    return { "PAYMENT-SIGNATURE": "fake-signature" };
  }
}

function exclusiveOf(options: FakePayerOptions): ExclusiveSection | undefined {
  if (options.refuseStart) return refusing;
  if (options.exclusive) return serialized();
  return undefined;
}
