import { describe, expect, it, vi } from "vite-plus/test";
import { createCriptonXrplPlugin } from "../../../src/interfaces/eliza/plugin.js";
import {
  DESTINATION,
  SOURCE,
  kitOver,
  readiness,
  readinessFake,
} from "../../support/interface-kit.js";

function fakeRuntime(scripted: unknown = {}) {
  return {
    useModel: vi.fn<() => Promise<unknown>>(async () => scripted),
    composeState: async () => ({ values: {}, data: {}, text: "" }),
    getSetting: () => undefined,
  };
}

const READY = { verdict: "ready", reasons: [], warnings: [], checks_failed: [] };

function action(name: string, overrides: Record<string, unknown> = {}) {
  const plugin = createCriptonXrplPlugin(kitOver(readinessFake(readiness(overrides))));
  const found = plugin.actions.find((a) => a.name === name);
  if (!found) throw new Error(`missing action ${name}`);
  return found;
}

describe("XRPL ElizaOS plugin", () => {
  it("Plugin shape", () => {
    const plugin = createCriptonXrplPlugin(kitOver(readinessFake(readiness())));
    expect(plugin.name.length).toBeGreaterThan(0);
    expect(plugin.description.length).toBeGreaterThan(0);
    expect(plugin.actions.map((a) => a.name).sort()).toEqual(
      ["CHECK_XRPL_PAYMENT_READINESS", "PREPARE_XRPL_PAYMENT", "QUOTE_XRPL_DEX"].sort(),
    );
    expect(plugin.providers.map((p) => p.name)).toEqual(["XRPL_FEE_STATUS"]);
  });

  it("Action reads structured content", async () => {
    const runtime = fakeRuntime();
    const result = await action("PREPARE_XRPL_PAYMENT", READY).handler(runtime, {
      content: { source: SOURCE, destination: DESTINATION, asset: "XRP", amount: "10" },
    });
    expect(runtime.useModel).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(
      (result.data as { transaction: { TransactionType: string } }).transaction.TransactionType,
    ).toBe("Payment");
  });

  it("Action extracts input from text", async () => {
    const runtime = fakeRuntime({
      source: SOURCE,
      destination: DESTINATION,
      asset: "XRP",
      amount: "10",
    });
    const result = await action("PREPARE_XRPL_PAYMENT", READY).handler(runtime, {
      content: { text: `send 10 XRP from ${SOURCE} to ${DESTINATION}` },
    });
    expect(runtime.useModel).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect((result.data as { transaction: { Destination: string } }).transaction.Destination).toBe(
      DESTINATION,
    );
  });

  it("Action with missing input", async () => {
    const runtime = fakeRuntime({ source: SOURCE, asset: "XRP", amount: "10" });
    const result = await action("PREPARE_XRPL_PAYMENT").handler(runtime, {
      content: { text: "send 10 XRP somewhere" },
    });
    expect(result.success).toBe(false);
    const json = JSON.parse(result.text ?? "") as { code: string; details?: { field?: string } };
    expect(json.code).toBe("invalid-input");
    expect(json.details?.field).toBe("destination");
  });
});
