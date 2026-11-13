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

Other methods: `kit.data.*` (`latestSlot`, `health`, `healthHistory`, `token`, `transferReadiness`, one per `/v1/solana/*` route), `kit.priceOf(resource)`, `kit.prices()` (the price index), `kit.spent()` and `kit.credits` (prepaid credits, see below).

## Configuration

| Variable                   | Default                       | Meaning                                                                                                               |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `CRIPTON_API_URL`          | `https://api.criptonlabs.com` | API base URL (must be a valid URL).                                                                                   |
| `CRIPTON_TIER`             | `free`                        | `free` or `pro`.                                                                                                      |
| `CRIPTON_MAX_PER_CALL`     | unset                         | Per-call spend cap, decimal string. Mandatory to pay.                                                                 |
| `CRIPTON_SESSION_BUDGET`   | unset                         | Optional cap on the total spent in a session, decimal.                                                                |
| `CRIPTON_SOLANA_PAYER_KEY` | unset                         | Secret key that signs x402 payments: base58 (64 bytes) or a JSON array of 64 integers. Environment only.              |
| `CRIPTON_SOLANA_PAY_ASSET` | `USDC`                        | `USDC` or `EURC`. The kit never switches asset.                                                                       |
| `CRIPTON_SOLANA_NETWORK`   | `mainnet`                     | `mainnet` or `devnet`.                                                                                                |
| `CRIPTON_SOLANA_RPC_URL`   | unset                         | Optional Solana RPC URL used while paying (the public RPC is rate-limited).                                           |
| `CRIPTON_CREDITS_TOKEN`    | unset                         | Prepaid credit token (`clc_...`). Needs tier `pro`. Environment only.                                                 |
| `CRIPTON_SOLANA_SIWX`      | `off`                         | `on` spends credits with a Sign-In-With-X proof of the payer wallet. Needs `CRIPTON_SOLANA_PAYER_KEY` and tier `pro`. |
| `CRIPTON_TOPUP_MAX`        | unset                         | Per-purchase maximum of the MCP tool `solana_credits_topup`, decimal. Set together with `CRIPTON_TOPUP_BUDGET`.       |
| `CRIPTON_TOPUP_BUDGET`     | unset                         | Cap on the total of the process's top-ups, decimal. Set together with `CRIPTON_TOPUP_MAX`.                            |

Payment is enabled only when both `CRIPTON_SOLANA_PAYER_KEY` and `CRIPTON_MAX_PER_CALL` are set. `CRIPTON_TOPUP_MAX` and `CRIPTON_TOPUP_BUDGET` must be set together or not at all. An invalid value fails with an `invalid-input` error that names the variable, never its value. For a `solana-keygen` file, load it without writing the key anywhere else:

```bash
export CRIPTON_SOLANA_PAYER_KEY="$(cat id.json)"
```

## Tools

Addresses and mints are base58 and must decode to 32 bytes; `mint` in transfers is a mint address or `"SOL"`. Amounts are decimal strings in the asset's units (at most 9 decimals for SOL). Invalid inputs are rejected before any request. Every response carries `meta` (`slot`, `commitment` = `finalized`, `as_of`, `age_seconds`, `cache`, `stale`).

| Tool                        | Returns                                                                                                                   | Main inputs                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `solana_latest_slot`        | Latest slot and block time                                                                                                | none                                         |
| `solana_network_health`     | Status (up, down, unknown or unavailable), latest slot, probe latency and last probe time                                 | none                                         |
| `solana_health_history`     | Time buckets with samples, uptime percent and average latency                                                             | `window?` (`1h`, `24h` or `7d`)              |
| `solana_token`              | Token program, decimals, supply, mint and freeze authorities, extensions, transfer fee, safety verdict, reasons           | `mint` (a mint address; `SOL` is not a mint) |
| `solana_transfer_readiness` | Verdict on whether the transfer can succeed (balance, token accounts, fees), blockers and warnings                        | `source`, `destination`, `mint`, `amount`    |
| `solana_prepare_transfer`   | Unsigned transfer description after the readiness check; never signs or sends                                             | `source`, `destination`, `mint`, `amount`    |
| `solana_credits_status`     | Whether a credit token is configured, whether SIWX spending is on, last known balance, top-up spend; no request, no token | none                                         |
| `solana_credits_topup`      | Opt-in purchase of one credit bundle (see [Purchase limits](#purchase-limits)); the result never holds the token          | `bundle`                                     |

Every tool except `solana_credits_topup` is read-only. `solana_credits_topup` is listed only by an MCP server configured with the purchase limits.

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

| Command                                        | Purpose                                 |
| ---------------------------------------------- | --------------------------------------- |
| `mcp`                                          | Start the stdio MCP server              |
| `slot`                                         | Latest slot and block time              |
| `health`                                       | Network health summary                  |
| `token <mint>`                                 | SPL token mint data                     |
| `readiness --from --to --mint --amount`        | Transfer readiness                      |
| `prepare-transfer --from --to --mint --amount` | Unsigned transfer description           |
| `topup <bundle> --max <amount>`                | Buy a prepaid credit bundle             |
| `rotate-token`                                 | Issue a new credit token for the wallet |
| `credits`                                      | Credit status                           |

`topup` and `rotate-token` print the new credit token once on stdout and a notice on stderr to store it in `CRIPTON_CREDITS_TOKEN`. `<command> --help` prints a command's help without reading the environment.

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

The server registers as `criptonlabs-agent-apis-solana`. For the paid tier add `CRIPTON_MAX_PER_CALL`, `CRIPTON_SOLANA_PAYER_KEY` (and optionally `CRIPTON_SESSION_BUDGET`, `CRIPTON_SOLANA_PAY_ASSET`, `CRIPTON_SOLANA_RPC_URL`), `CRIPTON_CREDITS_TOKEN` or `CRIPTON_SOLANA_SIWX=on` with the payer key to `env`, using a secret store rather than a committed file, and set `CRIPTON_TIER` to `pro`. The purchase tool `solana_credits_topup` is added only when `CRIPTON_TIER` is `pro` and `CRIPTON_SOLANA_PAYER_KEY`, `CRIPTON_TOPUP_MAX` and `CRIPTON_TOPUP_BUDGET` are all set (see [Purchase limits](#purchase-limits)).

## Frameworks

Each entry accepts a kit or a config (the environment when omitted).

| Framework          | Import                                  | Function                                                                  |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------------- |
| Vercel AI SDK      | `@criptonlabs/agent-apis-solana/ai-sdk` | `createCriptonSolanaTools(kitOrConfig?)`                                  |
| Mastra             | `@criptonlabs/agent-apis-solana/mastra` | `createMastraSolanaTools(kitOrConfig?)` (async)                           |
| ElizaOS            | `@criptonlabs/agent-apis-solana/eliza`  | `criptonSolanaPlugin`, `createCriptonSolanaPlugin`                        |
| MCP (programmatic) | `@criptonlabs/agent-apis-solana/mcp`    | `createSolanaMcpServer(kit, { topup? })`, `startSolanaMcpServer(config?)` |

```ts
import { createCriptonSolanaTools } from "@criptonlabs/agent-apis-solana/ai-sdk";

const tools = createCriptonSolanaTools(); // pass to generateText({ tools, ... })
```

The AI SDK and Mastra maps expose the 7 read-only tools; they have no purchase tool. `startSolanaMcpServer()` without a config reads the kit and `CRIPTON_TOPUP_MAX` from the environment.

The ElizaOS plugin (`criptonlabs-solana`) exposes two actions (`PREPARE_SOLANA_TRANSFER`, `CHECK_SOLANA_TRANSFER_READINESS`) and one provider (`SOLANA_NETWORK_STATUS`).

## Payments and spend limits

- The free tier (`/v1/solana/*`) needs no configuration. The paid tier (`/v1/pro/solana/*`) is charged only when you opt in.
- Most `/v1/pro/solana/*` routes may be paid only with prepaid credits (`credits-required`). Per-call x402 payment, in USDC or EURC on Solana, applies where the API offers it (today transfer readiness).
- Opt in with `CRIPTON_TIER=pro`, `CRIPTON_SOLANA_PAYER_KEY` and `CRIPTON_MAX_PER_CALL` (mandatory). `CRIPTON_SESSION_BUDGET` is optional.
- Limits compare the decimal amount in the payment asset's units (the API offers atomic units; the kit converts). The offered amount is the gross price, VAT included when the API quotes it.
- A call whose price exceeds `maxPerCall`, or would exceed `sessionBudget`, is refused before any payment is signed.
- Prices are read from the API at runtime (`GET /v1/pro/requirements`, `kit.prices()`, `kit.priceOf(resource)`); nothing is hardcoded. `kit.spent()` returns the amount spent so far.
- The kit never switches tier or payment asset, and never pays on its own.

Programmatic equivalent, with the key taken from the environment:

```ts
const kit = createSolanaAgentKit({
  tier: "pro",
  wallet: { key: process.env.CRIPTON_SOLANA_PAYER_KEY!, asset: "USDC" },
  payment: {
    maxPerCall: process.env.CRIPTON_MAX_PER_CALL!,
    sessionBudget: process.env.CRIPTON_SESSION_BUDGET,
  },
});
```

## Prepaid credits

- With `CRIPTON_TIER=pro` and a credit token (`CRIPTON_CREDITS_TOKEN`; in code, `credits: { token }` with the value read from the environment), paid-tier calls carry `Authorization: Bearer` and spend credits. The token is a secret: keep it in the environment or a secret store, never written in code, prompts, logs or command-line arguments (the CLI refuses it as an argument).
- Sign-In-With-X (SIWX): with `CRIPTON_SOLANA_SIWX=on` (or `credits: { siwx: true }` in code), a payer key and no credit token, the kit answers the API's Sign-In-With-X challenges on paid-tier calls with a signature of the wallet and spends the wallet's credits without a token. A configured token always comes first. SIWX needs the optional peer `@x402/extensions`.
- `kit.credits.lastKnownBalance()` returns the balance per denomination from the API's last credit-paid answer (`null` before one), `kit.credits.hasToken()` whether a token is configured, `kit.credits.siwxEnabled()` whether SIWX spending is on and `kit.credits.topupSpent()` the amount spent on top-ups by this process. `solana_credits_status` and the CLI `credits` command report the same four values; no tool result or error contains the token.
- Credit purchases use `POST /v1/pro/credits/{bundle}`, paid with the wallet in its configured asset (USDC pays the bundles priced in USD, EURC the bundles priced in EUR); bundle ids and prices come from the API's credits offer at run time.
- `kit.credits.rotateToken()` and the CLI `rotate-token` issue a new token for the wallet with a SIWX proof (`POST /v1/pro/credits/token`); the API revokes the wallet's earlier tokens. Rotation never debits credits and needs `@x402/extensions`.

```ts
const kit = createSolanaAgentKit({
  tier: "pro",
  wallet: { key: process.env.CRIPTON_SOLANA_PAYER_KEY!, asset: "EURC" },
  credits: { topupBudget: "<your-topup-budget>" },
});

const bought = await kit.credits.topup({ bundle: "<bundle-id>", maxAmount: "<max-amount>" });
// bought.token is shown only here: store it in CRIPTON_CREDITS_TOKEN right away.
```

## Purchase limits

- A top-up needs its own maximum: `maxAmount` in `kit.credits.topup({ bundle, maxAmount })`, `--max` in `agent-apis-solana topup <bundle> --max <amount>`. A bundle priced above it is refused before anything is signed.
- `maxPerCall` and `sessionBudget` never apply to purchases; they limit per-call payments only.
- `credits.topupBudget` (`CRIPTON_TOPUP_BUDGET`) caps the total of the process's purchases. A purchase whose answer is lost counts as spent.
- A credit token is shown once: `kit.credits.topup` and `kit.credits.rotateToken` return it (serialized results show `[redacted]`) and the CLI `topup` and `rotate-token` print it once. Store it in `CRIPTON_CREDITS_TOKEN` right away.
- A Solana wallet recovers its credits with `rotate-token` (`kit.credits.rotateToken()`), which revokes the wallet's earlier tokens.
- When the API cannot confirm a purchase's settlement it answers `payment-settlement-failed` with a provisional token and an event id: the CLI prints the token once, and it becomes valid only if the payment is reconciled. Through the MCP tool `solana_credits_topup` the same answer is an error with `details.eventId` and no token: the purchase may still settle and its amount already counts toward the top-up budget, so do not buy it again; once the API reconciles the payment, the credits belong to the wallet and `rotate-token` gives it a token for them.
- The MCP tool `solana_credits_topup` exists only with tier `pro` (`CRIPTON_TIER=pro`), `CRIPTON_SOLANA_PAYER_KEY`, `CRIPTON_TOPUP_MAX` (its per-purchase maximum) and `CRIPTON_TOPUP_BUDGET` (its per-process budget); programmatically, with `createSolanaMcpServer(kit, { topup: { maxAmount } })` and a kit that has tier `pro`, a wallet and `credits.topupBudget`. It keeps the bought token in process memory for later paid-tier calls and never shows it to the model. With a credit token already configured, it keeps using that token and does not keep the bought one.
- Its result reports `tokenKept`: true when the bought token became the process's token. When `tokenKept` is false (a token was already configured, or the bought token could not be kept), the purchase still happened: `rotate-token` (`kit.credits.rotateToken()`) gives the wallet a token for its credits and revokes the wallet's earlier tokens.

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

- Provide the secret key and the credit token only through the environment; never in code, prompts, logs, files or command-line arguments.
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
