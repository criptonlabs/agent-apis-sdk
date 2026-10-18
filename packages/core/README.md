# @criptonlabs/agent-apis-core

Network-independent core for the typed clients of the hosted Criptonlabs Agent APIs (https://api.criptonlabs.com).

## Who it is for

Authors of network kits. End users who want tools for a specific network should install the kit instead, today `@criptonlabs/xrpl-agent-kit`.

## Status

Pre-release. The package is private and not yet published to npm (version `0.0.0`); install instructions will be added when it is published.

## API surface

| Area               | Exports                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP client        | `ApiClient` (free and pro route namespaces, response validation, `meta`, timeouts, `priceOf`, `spent`); types `RouteCall`, `KitConfig`, `KitResponse`, `Transport`                                               |
| Network descriptor | `NetworkDescriptor` (`network`, `productToken`, `routeTimeoutsMs?`); each kit supplies its own                                                                                                                   |
| x402 payer         | `X402Payer` contract (`selectOption`, `createPaymentHeaders`), `PaymentConfig` (`payer`, `maxPerCall`, `sessionBudget?`), `PaymentReceipt`, `PaymentOption`                                                      |
| Errors             | `CriptonKitError` and `CriptonValidationError`, `CriptonProblemError`, `CriptonPaymentError`, `CriptonRefusalError`, `CriptonNetworkError`, `CriptonResponseError`, `MissingPeerDependencyError`; `KitErrorJson` |
| Money helpers      | `add`, `sub`, `cmp`, `isDecimal`, `assertDecimal`, `maxDecimals`, `mulPow10`, `addPercentFloor` (decimal strings, never floats)                                                                                  |
| Environment        | `readCommonEnv`, `buildPaymentConfig`                                                                                                                                                                            |
| Tools              | `ToolDefinition`, `ToolAnnotations`; `loadPeer`, `PeerImporter`                                                                                                                                                  |
| Adapters           | `createMcpServer`, `startMcpServer` (`/mcp`); `toAiSdkTools` (`/ai-sdk`); `toMastraTools` (`/mastra`); `toElizaResult` (`/eliza`)                                                                                |
| CLI runner         | `runCli`, `exitCodeFor`, `CliCommand`, `CliIo` (`/cli`)                                                                                                                                                          |

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

Payment is opt-in. Without a payer and `maxPerCall` the client never pays. It refuses a call whose price exceeds `maxPerCall` or would exceed `sessionBudget`. Prices are read from the API at runtime and are never stored in the package.

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
