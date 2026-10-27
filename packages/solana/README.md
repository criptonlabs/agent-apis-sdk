# @criptonlabs/agent-apis-solana

Typed client and agent tools for the Solana endpoints of the hosted Criptonlabs Agent APIs (https://api.criptonlabs.com). It answers pre-transaction questions (network status, token safety, transfer readiness) and describes unsigned SOL or SPL token transfers. It never signs or sends a transaction for your own transfers.

## Status

Pre-release. The package is private and not yet published to npm (version `0.0.0`); use it from the monorepo (see the root README). The install and MCP `npx` snippets below apply once it is published.

## Install

```bash
pnpm add @criptonlabs/agent-apis-solana
```

Requires Node.js >= 22.18. Framework packages (`@modelcontextprotocol/server`, `ai`, `@mastra/core`, `@elizaos/core`) are optional peer dependencies; install only the one you use.

## Quick start

```ts
import { createSolanaAgentKit } from "@criptonlabs/agent-apis-solana";

const kit = createSolanaAgentKit(); // free tier, hosted API

const health = await kit.data.health();
console.log(health.data, health.data.meta);

const prepared = await kit.prepareTransfer({
  source: "SourceWallet...",
  destination: "DestinationWallet...",
  mint: "SOL",
  amount: "0.5",
});
// `prepared.transaction` holds unsigned instructions; the kit never signs or sends them.
```

Other methods: `kit.data.*` (`latestSlot`, `health`, `healthHistory`, `token`, `transferReadiness`, one per `/v1/solana/*` route), `kit.priceOf(resource)` and `kit.spent()`.

## Configuration

| Variable                   | Default                       | Meaning                                                                                                  |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `CRIPTON_API_URL`          | `https://api.criptonlabs.com` | API base URL (must be a valid URL).                                                                      |
| `CRIPTON_TIER`             | `free`                        | `free` or `pro`.                                                                                         |
| `CRIPTON_MAX_PER_CALL`     | unset                         | Per-call spend cap, decimal string. Mandatory to pay.                                                    |
| `CRIPTON_SESSION_BUDGET`   | unset                         | Optional cap on the total spent in a session, decimal.                                                   |
| `CRIPTON_SOLANA_PAYER_KEY` | unset                         | Secret key that signs x402 payments: base58 (64 bytes) or a JSON array of 64 integers. Environment only. |
| `CRIPTON_SOLANA_PAY_ASSET` | `USDC`                        | `USDC` or `EURC`. The kit never switches asset.                                                          |
| `CRIPTON_SOLANA_NETWORK`   | `mainnet`                     | `mainnet` or `devnet`.                                                                                   |
| `CRIPTON_SOLANA_RPC_URL`   | unset                         | Optional Solana RPC URL used while paying (the public RPC is rate-limited).                              |

Payment is enabled only when both `CRIPTON_SOLANA_PAYER_KEY` and `CRIPTON_MAX_PER_CALL` are set. An invalid value fails with an `invalid-input` error that names the variable, never its value. For a `solana-keygen` file, load it without writing the key anywhere else:

```bash
export CRIPTON_SOLANA_PAYER_KEY="$(cat id.json)"
```

## Tools

Addresses and mints are base58 and must decode to 32 bytes; `mint` in transfers is a mint address or `"SOL"`. Amounts are decimal strings in the asset's units (at most 9 decimals for SOL). Invalid inputs are rejected before any request. Every response carries `meta` (`slot`, `commitment` = `finalized`, `as_of`, `age_seconds`, `cache`, `stale`).

| Tool                        | Returns                                                                                                         | Main inputs                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `solana_latest_slot`        | Latest slot and block time                                                                                      | none                                         |
| `solana_network_health`     | Status (up, down, unknown or unavailable), latest slot, probe latency and last probe time                       | none                                         |
| `solana_health_history`     | Time buckets with samples, uptime percent and average latency                                                   | `window?` (`1h`, `24h` or `7d`)              |
| `solana_token`              | Token program, decimals, supply, mint and freeze authorities, extensions, transfer fee, safety verdict, reasons | `mint` (a mint address; `SOL` is not a mint) |
| `solana_transfer_readiness` | Verdict on whether the transfer can succeed (balance, token accounts, fees), blockers and warnings              | `source`, `destination`, `mint`, `amount`    |
| `solana_prepare_transfer`   | Unsigned transfer description after the readiness check; never signs or sends                                   | `source`, `destination`, `mint`, `amount`    |

### Prepared transfer

`prepareTransfer` (and `solana_prepare_transfer`) checks readiness first and verifies the answer against the intent before using it:

- `source`, `destination` and `mint` echo the intent;
- for SOL, `decimals` is 9; for an SPL token, the token program is Token or Token-2022;
- `amount_raw` equals the intent amount in base units.

On a mismatch it refuses with `invalid-response` and builds nothing. It refuses with `transfer-not-ready` when the verdict is not ready. It returns:

```ts
{
  transaction: {
    feePayer: string;
    recentBlockhash: null; // set by the wallet
    instructions: Array<{
      programAddress: string;
      accounts: Array<{ address: string; signer: boolean; writable: boolean }>;
      data: string; // base64
    }>;
  }
  readiness: TransferReadinessResponse;
  ataCreation: {
    required: boolean;
    lamports: string | null;
  }
  meta: SolanaMeta;
}
```

SOL uses a System transfer. SPL tokens use `TransferChecked` on the mint's token program (Token or Token-2022), preceded by an idempotent associated token account creation when the destination needs one. The wallet sets the recent blockhash, signs and sends.

## CLI

`agent-apis-solana <command> [options]`. Add `--json` for compact JSON output (errors also go to stdout as JSON). Secrets are rejected as arguments.

| Command                                        | Purpose                       |
| ---------------------------------------------- | ----------------------------- |
| `mcp`                                          | Start the stdio MCP server    |
| `slot`                                         | Latest slot and block time    |
| `health`                                       | Network health summary        |
| `token <mint>`                                 | SPL token mint data           |
| `readiness --from --to --mint --amount`        | Transfer readiness            |
| `prepare-transfer --from --to --mint --amount` | Unsigned transfer description |

Exit codes:

| Code | Meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| 0    | Success                                                                          |
| 2    | Invalid input, unknown command, invalid arguments or a secret passed as argument |
| 3    | Payment error or refusal (transfer-not-ready, over cap, credits required, ...)   |
| 4    | API problem or invalid API response                                              |
| 5    | Network error or timeout                                                         |
| 1    | Any other error                                                                  |

## MCP (Claude Desktop, Cursor)

```json
{
  "mcpServers": {
    "solana": {
      "command": "npx",
      "args": ["-y", "@criptonlabs/agent-apis-solana", "mcp"],
      "env": { "CRIPTON_TIER": "free" }
    }
  }
}
```

The server registers as `criptonlabs-agent-apis-solana`. For the paid tier add `CRIPTON_MAX_PER_CALL`, `CRIPTON_SOLANA_PAYER_KEY` (and optionally `CRIPTON_SESSION_BUDGET`, `CRIPTON_SOLANA_PAY_ASSET`, `CRIPTON_SOLANA_RPC_URL`) to `env`, using a secret store rather than a committed file, and set `CRIPTON_TIER` to `pro`.

## Frameworks

Each entry accepts a kit or a config (the environment when omitted).

| Framework          | Import                                  | Function                                                      |
| ------------------ | --------------------------------------- | ------------------------------------------------------------- |
| Vercel AI SDK      | `@criptonlabs/agent-apis-solana/ai-sdk` | `createCriptonSolanaTools(kitOrConfig?)`                      |
| Mastra             | `@criptonlabs/agent-apis-solana/mastra` | `createMastraSolanaTools(kitOrConfig?)` (async)               |
| ElizaOS            | `@criptonlabs/agent-apis-solana/eliza`  | `criptonSolanaPlugin`, `createCriptonSolanaPlugin`            |
| MCP (programmatic) | `@criptonlabs/agent-apis-solana/mcp`    | `createSolanaMcpServer(kit)`, `startSolanaMcpServer(config?)` |

```ts
import { createCriptonSolanaTools } from "@criptonlabs/agent-apis-solana/ai-sdk";

const tools = createCriptonSolanaTools(); // pass to generateText({ tools, ... })
```

The ElizaOS plugin (`criptonlabs-solana`) exposes two actions (`PREPARE_SOLANA_TRANSFER`, `CHECK_SOLANA_TRANSFER_READINESS`) and one provider (`SOLANA_NETWORK_STATUS`).

## Payments and spend limits

- The free tier (`/v1/solana/*`) needs no configuration. The paid tier (`/v1/pro/solana/*`) is charged only when you opt in.
- Most `/v1/pro/solana/*` routes may be paid only with prepaid credits (`credits-required`). Per-call x402 payment, in USDC or EURC on Solana, applies where the API offers it (today transfer readiness).
- Opt in with `CRIPTON_TIER=pro`, `CRIPTON_SOLANA_PAYER_KEY` and `CRIPTON_MAX_PER_CALL` (mandatory). `CRIPTON_SESSION_BUDGET` is optional.
- Limits compare the decimal amount in the payment asset's units (the API offers atomic units; the kit converts). The offered amount is the gross price, VAT included when the API quotes it.
- A call whose price exceeds `maxPerCall`, or would exceed `sessionBudget`, is refused before any payment is signed.
- Prices are read from the API at runtime (`kit.priceOf(resource)`); nothing is hardcoded. `kit.spent()` returns the amount spent so far.
- The kit never switches tier or payment asset, and never pays on its own.

Programmatic equivalent, with the key taken from the environment:

```ts
const kit = createSolanaAgentKit({
  tier: "pro",
  payment: {
    key: process.env.CRIPTON_SOLANA_PAYER_KEY!,
    asset: "USDC",
    maxPerCall: process.env.CRIPTON_MAX_PER_CALL!,
    sessionBudget: process.env.CRIPTON_SESSION_BUDGET,
  },
});
```

## Errors

Tool and CLI errors have the shape `{ code, message, ... }` (plus `status`, `retryAfterSeconds` or `details` when relevant).

| Code                                                                                              | Meaning                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid-input`                                                                                   | Invalid argument or environment variable (`details.field`)                                                                                                                                                          |
| `invalid-response`                                                                                | The API response did not match the expected shape, or the transfer readiness did not match the intent (nothing is built)                                                                                            |
| `timeout`, `network-error`                                                                        | Request timed out or failed                                                                                                                                                                                         |
| `payment-disabled`, `no-supported-payment-option`, `payment-over-cap`, `payment-budget-exhausted` | Payment is not configured, unsupported or over a limit; `details.options[].amount` is the API's offer in atomic units (6 decimals for USDC and EURC)                                                                |
| `payment-outcome-unknown`                                                                         | The paid retry got no answer; the amount is counted as spent and the call is not retried                                                                                                                            |
| `credits-required`                                                                                | The route is paid only with prepaid credits (`details.prepaidOffer`)                                                                                                                                                |
| `transfer-not-ready`                                                                              | `prepare-transfer` refused (`details.reasons` holds the API blockers, `details.warnings` its warnings)                                                                                                              |
| `missing-peer-dependency`                                                                         | An optional framework package is not installed                                                                                                                                                                      |
| other slugs                                                                                       | RFC 9457 problem returned by the API, with its `status` (for example `solana-mint-not-found` 404, `invalid-parameters` 400), and `details.reason`, `details.prepaidOffer`, `details.errors` when the API sends them |

## Security notes

- Provide the secret key only through the environment; never in code, prompts, logs, files or command-line arguments.
- `solana_prepare_transfer` output is unsigned; review it before any signing happens elsewhere.
- Use a dedicated, low-balance payer wallet and set a small `CRIPTON_MAX_PER_CALL`.
- Use your own `CRIPTON_SOLANA_RPC_URL` in production; the public RPC of each network is rate-limited.
- Report vulnerabilities through the repository `SECURITY.md`.

## Guidance files

`SKILL.md` (Agent Skill) and `.cursorrules` ship with the package for coding agents.

## License

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). Names and marks are covered by the [trademark policy](https://github.com/criptonlabs/agent-apis-sdk/blob/main/TRADEMARKS.md).

## Disclaimer

This kit is free, open-source software released under the Apache License 2.0. It is not a product or service for sale: nobody is charged for downloading, installing or using it, and nobody is required to use it.

- The only charges that exist are made by the hosted Criptonlabs Agent APIs for their paid calls, and only when you configure payment yourself. Any payment is between you and the API, under the conditions the API publishes; this kit only signs the payments you authorize, within the limits you set.
- The software is experimental and provided "as is", without warranty of any kind, as stated in the `LICENSE`. API data and tool output may be inaccurate, incomplete, delayed or unavailable.
- Nothing in this kit or its output is financial, investment, legal, tax or accounting advice, or an offer or solicitation to buy or sell any asset.
- You are solely responsible for how you or your agents use the kit, for your keys, for every transaction you sign or send, and for checking that its output fits your use case. You assume all risks, including the loss of funds.
- To the maximum extent permitted by applicable law, the authors and copyright holders are not liable for any loss or damage arising from the use, misuse, modification or inability to use this software, including defects or bugs, or from any modified copy or fork.
