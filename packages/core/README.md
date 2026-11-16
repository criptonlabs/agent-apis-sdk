# @criptonlabs/agent-apis-core

[![version](https://img.shields.io/github/package-json/v/criptonlabs/agent-apis-sdk?filename=packages%2Fcore%2Fpackage.json&style=flat-square&label=version)](https://github.com/criptonlabs/agent-apis-sdk/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/criptonlabs/agent-apis-sdk/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/criptonlabs/agent-apis-sdk/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/criptonlabs/agent-apis-sdk?style=flat-square&color=blue)](https://github.com/criptonlabs/agent-apis-sdk/blob/main/LICENSE)
[![node](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fcriptonlabs%2Fagent-apis-sdk%2Fmain%2Fpackages%2Fcore%2Fpackage.json&query=%24.engines.node&label=node&style=flat-square&logo=nodedotjs&logoColor=white&color=5FA04E)](https://nodejs.org)
[![types](https://img.shields.io/badge/types-included-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://github.com/criptonlabs/agent-apis-sdk/tree/main/packages/core)

Network-independent core for the typed clients of the hosted Criptonlabs Agent APIs (https://api.criptonlabs.com).

## Who it is for

Authors of network kits. End users who want tools for a specific network should install a kit instead: `@criptonlabs/agent-apis-xrpl` (XRP Ledger) or `@criptonlabs/agent-apis-solana` (Solana).

## Status

Pre-release. The package is not yet published to npm; install instructions will be added when it is published. Versions and release notes are in [CHANGELOG.md](CHANGELOG.md).

## API surface

| Area               | Exports                                                                                                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP client        | `ApiClient` (free and pro route namespaces, response validation, `meta`, timeouts, `priceOf`, `spent`); types `RouteCall`, `KitConfig`, `KitResponse`, `Transport`                                                                                                                            |
| Network descriptor | `NetworkDescriptor` (`network`, `productToken`, `routeTimeoutsMs?`); each kit supplies its own                                                                                                                                                                                                |
| x402 payer         | `X402Payer` contract (`selectOption`, `createPaymentHeaders`, optional `decimalAmount(option)`: the option's amount in decimal asset units; absent means the offered amount already is decimal), `PaymentConfig` (`payer`, `maxPerCall`, `sessionBudget?`), `PaymentReceipt`, `PaymentOption` |
| Errors             | `CriptonKitError` and `CriptonValidationError`, `CriptonProblemError`, `CriptonPaymentError`, `CriptonRefusalError`, `CriptonNetworkError`, `CriptonResponseError`, `MissingPeerDependencyError`; `KitErrorJson`, `PrepaidSignals`, `ProblemFieldError`, `PrepaidOffer`, `PrepaidBundle`      |
| Money helpers      | `add`, `sub`, `cmp`, `isDecimal`, `assertDecimal`, `maxDecimals`, `mulPow10`, `divPow10`, `addPercentFloor` (decimal strings, never floats)                                                                                                                                                   |
| Environment        | `readCommonEnv`, `buildPaymentConfig`                                                                                                                                                                                                                                                         |
| Tools              | `ToolDefinition`, `ToolAnnotations`; `loadPeer`, `PeerImporter`                                                                                                                                                                                                                               |
| Adapters           | `createMcpServer`, `startMcpServer` (`/mcp`); `toAiSdkTools` (`/ai-sdk`); `toMastraTools` (`/mastra`); `toElizaResult` (`/eliza`)                                                                                                                                                             |
| CLI runner         | `runCli`, `exitCodeFor`, `CliCommand`, `CliIo` (`/cli`)                                                                                                                                                                                                                                       |

Entry points: `@criptonlabs/agent-apis-core` (also re-exports every symbol above), `/mcp`, `/ai-sdk`, `/mastra`, `/eliza`, `/cli`.

The framework packages (`@modelcontextprotocol/server`, `ai`, `@mastra/core`, `@elizaos/core`) are optional peer dependencies; install only the one you use. A missing one raises `MissingPeerDependencyError`.

## Configuration

Read by `readCommonEnv`:

| Variable                 | Default                       | Meaning                                                   |
| ------------------------ | ----------------------------- | --------------------------------------------------------- |
| `CRIPTON_API_URL`        | `https://api.criptonlabs.com` | API base URL (valid URL).                                 |
| `CRIPTON_TIER`           | `free`                        | `free` or `pro`.                                          |
| `CRIPTON_MAX_PER_CALL`   | unset                         | Per-call spend cap, decimal string. Mandatory to pay.     |
| `CRIPTON_SESSION_BUDGET` | unset                         | Optional total spend cap for the session, decimal string. |

Network-specific variables (payer seed and so on) are defined by each kit.

## Spend limits

Payment is opt-in. Without a payer and `maxPerCall` the client never pays. It refuses a call whose price exceeds `maxPerCall` or would exceed `sessionBudget`. The price compared is the amount the API offers, which is the gross price (VAT included when the API quotes it). Prices are read from the API at runtime and are never stored in the package.

The signed retry waits at least 30 seconds, because the API answers only after settlement. If it fails without an answer (timeout or network error), the payment may have settled: the amount counts as spent, the call is never retried, and the client raises `CriptonPaymentError` with code `payment-outcome-unknown`.

## Prepaid credits signals

The client does not buy or spend prepaid credits, but it reports the API's prepaid answers:

- A route paid only with prepaid credits raises `CriptonPaymentError` with code `credits-required`, whatever the payment configuration; nothing is signed.
- `CriptonPaymentError` and `CriptonProblemError` carry `prepaidOffer` (bundle version, top-up URL, bundles with id, amount, credited units and approximate calls) when the API offers credits, for example on an exhausted daily free quota (429 `rate-limited`), and `reason` with the problem's `error` member (for example `credits_insufficient`). Both appear in the error JSON `details`.

## Problem field errors

`CriptonProblemError` carries `errors` (entries with `field` and `message`) when the API names the failing fields, for example on `invalid-parameters`. They appear in the error JSON as `details.errors`.

## CLI

`runCli` refuses secrets passed as arguments: `--seed`, `--secret`, `--private-key`, `--key` and `--payer-key` (also in the `--flag=value` form) fail with exit code 2. Supply secrets only through the environment.

## Building a kit

A kit supplies a network descriptor, the route operations with their response schemas and, optionally, an x402 payer; the core does HTTP, problem errors, payment and limits.

```ts
import { ApiClient, type X402Payer } from "@criptonlabs/agent-apis-core";
import { z } from "zod";

const api = new ApiClient(
  { network: "mynet", productToken: "my-kit/0.1.0" }, // calls /v1/mynet/* (or /v1/pro/mynet/*)
  { tier: "free" },
);
const slot = await api.request({
  route: "slot/latest",
  schema: z.object({ slot: z.number(), meta: z.object({ stale: z.boolean() }) }),
});
```

A payer implements `X402Payer`: `selectOption` picks one of the API's options (or `null`), `createPaymentHeaders` signs it, and `decimalAmount` converts an atomic offer to decimal units so `maxPerCall` and `sessionBudget` compare like for like. See `packages/xrpl` and `packages/solana` for complete kits.

## Network-specific code

None. The core contains no routes, assets or tool names of any ledger.

## License

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). Names and marks are covered by the [trademark policy](https://github.com/criptonlabs/agent-apis-sdk/blob/main/TRADEMARKS.md).

## Disclaimer

This kit is free, open-source software released under the Apache License 2.0. It is not a product or service for sale: nobody is charged for downloading, installing or using it, and nobody is required to use it.

- The only charges that exist are made by the hosted Criptonlabs Agent APIs for their paid calls, and only when you configure payment yourself. Any payment is between you and the API, under the conditions the API publishes; this kit only signs the payments you authorize, within the limits you set.
- The software is experimental and provided "as is", without warranty of any kind, as stated in the `LICENSE`. API data and tool output may be inaccurate, incomplete, delayed or unavailable.
- Nothing in this kit or its output is financial, investment, legal, tax or accounting advice, or an offer or solicitation to buy or sell any asset.
- You are solely responsible for how you or your agents use the kit, for your keys and seeds, for every transaction you sign or submit, and for checking that its output fits your use case. You assume all risks, including the loss of funds.
- To the maximum extent permitted by applicable law, the authors and copyright holders are not liable for any loss or damage arising from the use, misuse, modification or inability to use this software, including defects or bugs, or from any modified copy or fork.
