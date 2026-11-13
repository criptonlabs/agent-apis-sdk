import { runCli } from "@criptonlabs/agent-apis-core/cli";
import { describe, expect, it } from "vite-plus/test";
import {
  creditToken,
  loadFixture,
  siwxInfo,
  type ResponseFixture,
} from "../../../../core/tests/support/credit-fixtures.js";
import { FakeClock } from "../../../../core/tests/support/fake-clock.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { createSolanaAgentKit } from "../../../src/index.js";
import { readSolanaEnv } from "../../../src/infrastructure/config/solana-env.js";
import { solanaCommands } from "../../../src/interfaces/cli/commands.js";
import token from "../../fixtures/responses/token.json" with { type: "json" };
import { eurOneCreated, eurOneDevnetChallenge } from "../../support/eur-one-topup.js";
import { startFakeSolanaRpc } from "../../support/fake-solana-rpc.js";
import { DESTINATION, SOURCE, healthFixture, solanaFake } from "../../support/interface-kit.js";
import { throwawayKey } from "../../support/keys.js";

const TRANSFER_FLAGS = ["--from", SOURCE, "--to", DESTINATION, "--mint", "SOL", "--amount", "0.01"];

/** The recorded rotation challenge (bound to `https://api.criptonlabs.com`, Solana mainnet). */
const ROTATION_CHALLENGE = loadFixture("rotation-challenge");
const ROTATION_URL = "https://api.criptonlabs.com/v1/pro/credits/token";

interface RunOptions {
  env?: NodeJS.ProcessEnv;
  /** Answered in order instead of the Solana data routes. */
  responses?: readonly ResponseFixture[];
  /** The kit clock (SIWX challenge expiry). */
  clock?: FakeClock;
}

function fakeFor(responses: RunOptions["responses"]): FakeTransport {
  if (responses === undefined) return solanaFake();
  const fake = new FakeTransport();
  for (const response of responses) fake.respond(response);
  return fake;
}

function run(argv: string[], options: RunOptions = {}) {
  const fake = fakeFor(options.responses);
  const out: string[] = [];
  const err: string[] = [];
  const done = runCli(
    solanaCommands((env) =>
      createSolanaAgentKit({
        ...readSolanaEnv(env),
        transport: fake.transport,
        ...(options.clock !== undefined ? { clock: options.clock } : {}),
      }),
    ),
    argv,
    options.env ?? {},
    { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) },
  );
  const urls = () => fake.requests.map((r) => new URL(r.url));
  const json = () => JSON.parse(out.join("")) as Record<string, unknown>;
  return { done, out, err, urls, json, fake };
}

/** How many times `needle` occurs in `text` (the count only, so a token is never printed). */
function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("Solana CLI commands map flags to requests", () => {
  it("health reads the health route", async () => {
    const r = run(["health", "--json"]);
    expect(await r.done).toBe(0);
    expect(r.urls()[0]?.pathname).toBe("/v1/solana/health");
    expect(r.json()).toMatchObject({ status: healthFixture.status, slot: healthFixture.slot });
  });

  it("token <mint> reads that mint", async () => {
    const r = run(["token", token.mint, "--json"]);
    expect(await r.done).toBe(0);
    expect(r.urls()[0]?.pathname).toBe(`/v1/solana/token/${token.mint}`);
    expect(r.json()).toMatchObject({ mint: token.mint, decimals: token.decimals });
  });

  it("token without a mint exits 2 and sends nothing", async () => {
    const r = run(["token", "--json"]);
    expect(await r.done).toBe(2);
    expect(r.err.join("") + r.out.join("")).toContain("mint");
    expect(r.urls()).toHaveLength(0);
  });

  it("readiness maps --from, --to, --mint and --amount", async () => {
    const r = run(["readiness", ...TRANSFER_FLAGS, "--json"]);
    expect(await r.done).toBe(0);
    const url = r.urls()[0];
    expect(url?.pathname).toBe("/v1/solana/transfer-readiness");
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      source: SOURCE,
      destination: DESTINATION,
      mint: "SOL",
      amount: "0.01",
    });
    expect(r.json()).toMatchObject({ ready: true });
  });

  it("prepare-transfer prints the unsigned transfer for a ready SOL readiness", async () => {
    const r = run(["prepare-transfer", ...TRANSFER_FLAGS, "--json"]);
    expect(await r.done).toBe(0);
    const result = r.json() as { transaction: { feePayer: string; recentBlockhash: unknown } };
    expect(result.transaction.feePayer).toBe(SOURCE);
    expect(result.transaction.recentBlockhash).toBeNull();
  });

  it("readiness without --mint exits 2 naming the flag and sends nothing", async () => {
    const r = run(["readiness", "--from", SOURCE, "--to", DESTINATION, "--amount", "1", "--json"]);
    expect(await r.done).toBe(2);
    expect(r.err.join("") + r.out.join("")).toContain("mint");
    expect(r.urls()).toHaveLength(0);
  });

  it("prepare-transfer without --amount exits 2 naming the flag", async () => {
    const r = run(["prepare-transfer", "--from", SOURCE, "--to", DESTINATION, "--mint", "SOL"]);
    expect(await r.done).toBe(2);
    expect(r.err.join("") + r.out.join("")).toContain("amount");
    expect(r.urls()).toHaveLength(0);
  });

  it("Solana top-up command without a maximum", async () => {
    const r = run(["topup", "eur-1"]);
    expect(await r.done).toBe(2);
    // `--max` as a whole flag name, not a prefix of another flag.
    expect(r.err.join("") + r.out.join("")).toMatch(/--max(?![-\w])/);
    expect(r.urls()).toHaveLength(0);
  });

  it("Solana top-up command prints the token once", async () => {
    const key = throwawayKey();
    const bought = creditToken();
    const rpc = await startFakeSolanaRpc();
    try {
      const r = run(["topup", "eur-1", "--max", "1.21", "--json"], {
        env: {
          CRIPTON_SOLANA_PAYER_KEY: key.base58,
          CRIPTON_SOLANA_NETWORK: "devnet",
          CRIPTON_SOLANA_PAY_ASSET: "EURC",
          CRIPTON_SOLANA_RPC_URL: rpc.url,
        },
        responses: [eurOneDevnetChallenge(), eurOneCreated(key, bought)],
      });

      expect(await r.done).toBe(0);
      expect(occurrences(r.out.join(""), bought), "the token on stdout").toBe(1);
      // A boolean, so a failure never prints stderr (it could hold the token).
      const notice = r.err.join("").includes("CRIPTON_CREDITS_TOKEN");
      expect(notice, "the notice naming CRIPTON_CREDITS_TOKEN on stderr").toBe(true);
    } finally {
      await rpc.stop();
    }
  });

  it("Rotate token command", async () => {
    const newToken = creditToken();
    const created = loadFixture("rotation-201", { "<credit-token>": newToken });
    const r = run(["rotate-token", "--json"], {
      env: {
        CRIPTON_SOLANA_PAYER_KEY: throwawayKey().base58,
        // The recorded challenge is bound to this origin (domain and uri).
        CRIPTON_API_URL: new URL(ROTATION_URL).origin,
      },
      responses: [ROTATION_CHALLENGE, created],
      clock: new FakeClock(Date.parse(siwxInfo(ROTATION_CHALLENGE).issuedAt)),
    });

    expect(await r.done).toBe(0);
    expect(occurrences(r.out.join(""), newToken), "the new token on stdout").toBe(1);
    expect(r.fake.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST ${ROTATION_URL}`,
      `POST ${ROTATION_URL}`,
    ]);
    expect(r.fake.requests[1]?.headers["sign-in-with-x"], "the signed retry").toBeDefined();
  });
});
