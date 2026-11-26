import { CriptonPaymentError } from "@criptonlabs/agent-apis-core";

/** Wait limit before a queued payment fails with `payment-busy` (design D6). */
const PAYMENT_WAIT_LIMIT_MS = 20_000;

const BUSY_MESSAGE =
  "Another payment from this XRPL wallet is still settling; nothing was signed or charged. Try again shortly.";

/** A queued task waiting for its turn; `start` hands it the section. */
interface Waiter {
  start: () => void;
}

/** The exclusive section of one account: whether a task runs, and the tasks waiting in order. */
interface AccountLine {
  running: boolean;
  waiting: Waiter[];
}

/** One line per `<caip2>:<classic address>` in this process; an entry is deleted when it drains. */
const lines = new Map<string, AccountLine>();

function lineOf(key: string): AccountLine {
  const existing = lines.get(key);
  if (existing !== undefined) return existing;
  const line: AccountLine = { running: false, waiting: [] };
  lines.set(key, line);
  return line;
}

function busyError(): CriptonPaymentError {
  return Object.assign(new CriptonPaymentError("payment-busy", []), { message: BUSY_MESSAGE });
}

/** Resolves when the line hands this task the section; rejects with `payment-busy` after the wait limit. */
function waitTurn(line: AccountLine): Promise<void> {
  return new Promise((resolve, reject) => {
    const waiter: Waiter = {
      start: () => {
        clearTimeout(timer);
        resolve();
      },
    };
    const timer = setTimeout(() => {
      line.waiting.splice(line.waiting.indexOf(waiter), 1);
      reject(busyError());
    }, PAYMENT_WAIT_LIMIT_MS);
    line.waiting.push(waiter);
  });
}

/** Hands the section to the next waiting task, or deletes the drained line (design D2, D3). */
function releaseNext(key: string, line: AccountLine): void {
  const next = line.waiting.shift();
  if (next !== undefined) {
    next.start();
    return;
  }
  line.running = false;
  lines.delete(key);
}

async function runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
  const line = lineOf(key);
  if (line.running) await waitTurn(line);
  line.running = true;
  try {
    return await task();
  } finally {
    releaseNext(key, line);
  }
}

/**
 * The exclusive section shared by every payer of `account` on `caip2` in this process; the
 * returned function looks the queue up on every call.
 */
export function accountQueue(
  caip2: string,
  account: string,
): <T>(task: () => Promise<T>) => Promise<T> {
  const key = `${caip2}:${account}`;
  return (task) => runExclusive(key, task);
}
