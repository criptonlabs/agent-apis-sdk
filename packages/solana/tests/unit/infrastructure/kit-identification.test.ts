import { existsSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import pkg from "../../../package.json" with { type: "json" };
import { createSolanaAgentKit } from "../../../src/index.js";
import slotFixture from "../../fixtures/responses/slot-latest.json" with { type: "json" };

describe("Kit identification", () => {
  it("Solana package and binary names", () => {
    expect(pkg.name).toBe("@criptonlabs/agent-apis-solana");
    const bin = (pkg.bin as Record<string, string>)["agent-apis-solana"];
    expect(bin).toBe("bin/agent-apis-solana.js");
    expect(existsSync(new URL(`../../../${bin}`, import.meta.url))).toBe(true);
  });

  it("Solana product token in requests", async () => {
    const fake = new FakeTransport().respond({ body: slotFixture });
    const kit = createSolanaAgentKit({ transport: fake.transport });
    await kit.data.latestSlot().catch(() => undefined);
    expect(fake.requests[0]?.headers["user-agent"]).toMatch(
      new RegExp(`^agent-apis-solana/${pkg.version.replaceAll(".", "\\.")} `),
    );
  });
});
