import type { KitResponse } from "@criptonlabs/agent-apis-core";
import type { XrplDataPort } from "../../src/application/ports.js";

type Operation = keyof XrplDataPort;

export interface RecordedCall {
  operation: Operation;
  args: unknown[];
}

/** In-memory XrplDataPort: scripted answer per operation, calls recorded in order. */
export class FakeDataPort {
  readonly calls: RecordedCall[] = [];
  private readonly scripted = new Map<Operation, unknown>();

  script(operation: Operation, data: unknown): this {
    this.scripted.set(operation, data);
    return this;
  }

  get operations(): Operation[] {
    return this.calls.map((call) => call.operation);
  }

  argsOf(operation: Operation): unknown[] | undefined {
    return this.calls.find((call) => call.operation === operation)?.args;
  }

  readonly port: XrplDataPort = new Proxy({} as XrplDataPort, {
    get: (_target, property) => {
      const operation = property as Operation;
      return (...args: unknown[]): Promise<KitResponse<unknown>> => {
        this.calls.push({ operation, args });
        if (!this.scripted.has(operation)) {
          return Promise.reject(new Error(`fake-data-port: no scripted answer for ${operation}`));
        }
        return Promise.resolve({
          data: this.scripted.get(operation),
          receipt: null,
          credits: null,
          replayed: false,
        });
      };
    },
  });
}
