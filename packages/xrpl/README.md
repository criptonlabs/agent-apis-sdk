# @criptonlabs/xrpl-agent-kit

Typed client and agent tools for the XRP Ledger endpoints of the hosted Criptonlabs Agent APIs (https://api.criptonlabs.com). It answers pre-transaction questions (fees, readiness, liquidity, paths) before an agent builds or submits a transaction. It never signs or submits a transaction for your own transfers.

## Status

Pre-release. The package is private and not yet published to npm (version `0.0.0`); use it from the monorepo (see the root README). The install and MCP `npx` snippets below apply once it is published.

## Install

```
pnpm add @criptonlabs/xrpl-agent-kit
```

Requires Node.js >= 22.18. Framework packages (`@modelcontextprotocol/server`, `ai`, `@mastra/core`, `@elizaos/core`) are optional peer dependencies; install only the one you use.

## Quick start

```ts
import { createXrplAgentKit } from "@criptonlabs/xrpl-agent-kit";

const kit = createXrplAgentKit(); // free tier, hosted API

const fee = await kit.data.fee();
console.log(fee.data, fee.data.meta);

const prepared = await kit.preparePayment({
  source: "rSource...",
  destination: "rDestination...",
  asset: "XRP",
  amount: "10",
});
// `prepared` holds an unsigned Payment; the kit never signs or submits it.
```

Other methods: `kit.data.*` (one per `/v1/xrpl/*` route), `kit.dexQuote`, `kit.priceOf(resource)` and `kit.spent()`.

## Configuration

| Variable                  | Default                       | Meaning                                                |
| ------------------------- | ----------------------------- | ------------------------------------------------------ |
| `CRIPTON_API_URL`         | `https://api.criptonlabs.com` | API base URL (must be a valid URL).                    |
| `CRIPTON_TIER`            | `free`                        | `free` or `pro`.                                       |
| `CRIPTON_MAX_PER_CALL`    | unset                         | Per-call spend cap, decimal string. Mandatory to pay.  |
| `CRIPTON_SESSION_BUDGET`  | unset                         | Optional cap on the total spent in a session, decimal. |
| `CRIPTON_XRPL_PAYER_SEED` | unset                         | XRPL seed that signs x402 payments. Environment only.  |
| `CRIPTON_XRPL_NETWORK`    | `mainnet`                     | `mainnet` or `testnet`.                                |
| `CRIPTON_XRPL_WS_URL`     | unset                         | Optional XRPL WebSocket URL used while paying.         |

Payment is enabled only when both `CRIPTON_XRPL_PAYER_SEED` and `CRIPTON_MAX_PER_CALL` are set. An invalid value fails with an `invalid-input` error that names the variable, never its value.

## Tools

Assets are written `"XRP"` or `"<currency>.<issuer>"`; amounts are decimal strings. Every response carries `meta` (`ledger_index`, `as_of`, `age_seconds`, `cache`, `stale`).

| Tool                        | Returns                                                                                      | Main inputs                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `xrpl_fee`                  | Fee tiers (economy, standard, priority) in drops and the congestion band                     | none                                                                                                                              |
| `xrpl_network_health`       | Status (ok, degraded, down or unknown), latest ledger index and per-node probe results       | none                                                                                                                              |
| `xrpl_latest_ledger`        | Latest validated ledger: index, hash, close time                                             | none                                                                                                                              |
| `xrpl_orderbook`            | Funded order book (bids and asks with funded liquidity)                                      | `base`, `quote`, `depth?`                                                                                                         |
| `xrpl_slippage`             | Estimated slippage of buying the base amount on the order book and the AMM, and best venue   | `base`, `quote`, `amount`, `depth?`                                                                                               |
| `xrpl_amm`                  | AMM pool of a pair: the two reserves and the trading fee                                     | `a`, `b`                                                                                                                          |
| `xrpl_account_summary`      | XRP balance, sequence, owner count, transfer rate and trust lines                            | `address`                                                                                                                         |
| `xrpl_account_lines`        | Trust lines of an account, paginated with a marker                                           | `address`, `limit?`, `peer?`, `marker?`                                                                                           |
| `xrpl_account_transactions` | Recent transactions of an account, paginated with a marker                                   | `address`, `limit?`, `marker?`                                                                                                    |
| `xrpl_token`                | Issuer, currency, transfer fee, freeze and authorization flags, domain, obligations          | `asset`                                                                                                                           |
| `xrpl_payment_readiness`    | Verdict on whether a payment can succeed (trust line, reserve, destination rules), reasons   | `source`, `destination`, `asset?`, `amount?`, `destinationTag?`                                                                   |
| `xrpl_paths`                | Multi-hop payment paths with the source amount needed (can take up to about 20 s)            | `source`, `destination`, `asset`, `amount`, `sendMaxAsset?`, `sendMax?`, `sourceAssets?`                                          |
| `xrpl_prepare_payment`      | Unsigned `Payment` after readiness check, path search and fee choice; never signs or submits | `source`, `destination`, `asset`, `amount`, `destinationTag?`, `sourceAsset?`, `sendMaxTolerancePct?`, `feeTier?`, `maxFeeDrops?` |
| `xrpl_dex_quote`            | Filled amount, average price, slippage and best venue; refuses above the slippage limit      | `base`, `quote`, `amount`, `depth?`, `maxSlippagePct?`                                                                            |

`depth` is 10, 50, 100 or 200. `sendMaxTolerancePct` is required for cross-currency payments.

## CLI

`xrpl-agent-kit <command> [options]`. Add `--json` for compact JSON output (errors also go to stdout as JSON). Secrets are rejected as arguments.

| Command                                                                                                                     | Purpose                    |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `mcp`                                                                                                                       | Start the stdio MCP server |
| `fee`                                                                                                                       | Fee tiers and congestion   |
| `account <address>`                                                                                                         | Account summary            |
| `token <asset>`                                                                                                             | Issued token data          |
| `readiness --from --to [--asset --amount --destination-tag]`                                                                | Payment readiness          |
| `prepare-payment --from --to --asset --amount [--destination-tag --source-asset --send-max-tolerance --fee-tier --max-fee]` | Unsigned payment           |
| `quote-dex --base --quote --amount [--depth --max-slippage]`                                                                | DEX quote                  |

Exit codes:

| Code | Meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| 0    | Success                                                                          |
| 2    | Invalid input, unknown command, invalid arguments or a secret passed as argument |
| 3    | Payment error or refusal (payment-not-ready, slippage-over-limit, over cap, ...) |
| 4    | API problem or invalid API response                                              |
| 5    | Network error or timeout                                                         |
| 1    | Any other error                                                                  |

## MCP (Claude Desktop, Cursor)

```json
{
  "mcpServers": {
    "xrpl": {
      "command": "npx",
      "args": ["-y", "@criptonlabs/xrpl-agent-kit", "mcp"],
      "env": { "CRIPTON_TIER": "free" }
    }
  }
}
```

For the paid tier add `CRIPTON_MAX_PER_CALL`, `CRIPTON_XRPL_PAYER_SEED` (and optionally `CRIPTON_SESSION_BUDGET`) to `env`, using a secret store rather than a committed file, and set `CRIPTON_TIER` to `pro`.

## Frameworks

Each entry accepts a kit or a config (the environment when omitted).

| Framework          | Import                               | Function                                                  |
| ------------------ | ------------------------------------ | --------------------------------------------------------- |
| Vercel AI SDK      | `@criptonlabs/xrpl-agent-kit/ai-sdk` | `createCriptonXrplTools(kitOrConfig?)`                    |
| Mastra             | `@criptonlabs/xrpl-agent-kit/mastra` | `createMastraXrplTools(kitOrConfig?)` (async)             |
| ElizaOS            | `@criptonlabs/xrpl-agent-kit/eliza`  | `criptonXrplPlugin`, `createCriptonXrplPlugin`            |
| MCP (programmatic) | `@criptonlabs/xrpl-agent-kit/mcp`    | `createXrplMcpServer(kit)`, `startXrplMcpServer(config?)` |

```ts
import { createCriptonXrplTools } from "@criptonlabs/xrpl-agent-kit/ai-sdk";

const tools = createCriptonXrplTools(); // pass to generateText({ tools, ... })
```

The ElizaOS plugin exposes three actions (`PREPARE_XRPL_PAYMENT`, `QUOTE_XRPL_DEX`, `CHECK_XRPL_PAYMENT_READINESS`) and one provider (`XRPL_FEE_STATUS`).

## Payments and spend limits

- The free tier (`/v1/xrpl/*`) needs no configuration. The paid tier (`/v1/pro/xrpl/*`) is charged per call with x402, in RLUSD on the XRP Ledger, only when you opt in.
- Opt in with `CRIPTON_TIER=pro`, `CRIPTON_XRPL_PAYER_SEED` and `CRIPTON_MAX_PER_CALL` (mandatory). `CRIPTON_SESSION_BUDGET` is optional.
- A call whose price exceeds `maxPerCall`, or would exceed `sessionBudget`, is refused before any payment is signed.
- Prices are read from the API at runtime (`GET /v1/pro/requirements`, `kit.priceOf(resource)`); nothing is hardcoded. `kit.spent()` returns the amount spent so far.
- The kit never switches tier or pays on its own.

Programmatic equivalent, with the seed taken from the environment:

```ts
const kit = createXrplAgentKit({
  tier: "pro",
  payment: {
    seed: process.env.CRIPTON_XRPL_PAYER_SEED!,
    maxPerCall: process.env.CRIPTON_MAX_PER_CALL!,
    sessionBudget: process.env.CRIPTON_SESSION_BUDGET,
  },
});
```

## Errors

Tool and CLI errors have the shape `{ code, message, ... }` (plus `status`, `retryAfterSeconds` or `details` when relevant).

| Code                                                                                              | Meaning                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `invalid-input`                                                                                   | Invalid argument or environment variable (`details.field`)                                                                     |
| `invalid-response`                                                                                | The API response did not match the expected shape                                                                              |
| `timeout`, `network-error`                                                                        | Request timed out or failed                                                                                                    |
| `payment-disabled`, `no-supported-payment-option`, `payment-over-cap`, `payment-budget-exhausted` | Payment is not configured, unsupported or over a limit                                                                         |
| `payment-outcome-unknown`                                                                         | The paid retry got no answer; the amount is counted as spent and the call is not retried                                       |
| `credits-required`                                                                                | The route is paid only with prepaid credits (`details.prepaidOffer`)                                                           |
| `payment-not-ready`, `payment-readiness-unknown`, `no-path-found`, `fee-over-cap`                 | `prepare-payment` refused (`details.reasons`)                                                                                  |
| `slippage-over-limit`                                                                             | `quote-dex` refused above `maxSlippagePct`                                                                                     |
| `missing-peer-dependency`                                                                         | An optional framework package is not installed                                                                                 |
| other slugs                                                                                       | RFC 9457 problem returned by the API, with its `status` (and `details.reason`, `details.prepaidOffer` when the API sends them) |

## Security notes

- Provide the seed only through the environment; never in code, prompts, logs or command-line arguments.
- `xrpl_prepare_payment` output is unsigned; review it before any signing happens elsewhere.
- Use a dedicated, low-balance payer wallet and set a small `CRIPTON_MAX_PER_CALL`.
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
- You are solely responsible for how you or your agents use the kit, for your keys and seeds, for every transaction you sign or submit, and for checking that its output fits your use case. You assume all risks, including the loss of funds.
- To the maximum extent permitted by applicable law, the authors and copyright holders are not liable for any loss or damage arising from the use, misuse, modification or inability to use this software, including defects or bugs, or from any modified copy or fork.
