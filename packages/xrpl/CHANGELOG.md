# @criptonlabs/agent-apis-xrpl

## 0.0.1

### Patch Changes

- 489f092: Sync with the released API 0.21.0. BREAKING (pre-release): kit configuration is split into `wallet` (signer, network, asset, URLs), `payment` (the per-call opt-in: `maxPerCall`, `sessionBudget`) and `credits` (`token`, `topupBudget`, and `siwx` on Solana); environment variable names stay. Prepaid credits: spend with a token read from `CRIPTON_CREDITS_TOKEN`, last known balance, idempotency keys, and explicit top-ups with their own `maxAmount` (never `maxPerCall`) and an optional top-up budget; a bought token is shown once and never serialized, logged or handed to a tool result. Solana kit: Sign-In-With-X credit spending and token rotation (`@x402/extensions` as an optional peer). New free price index `prices()`, and API-owned code lists (reasons, warnings, statuses) tolerate unknown values instead of failing with `invalid-response`. New tools `xrpl_credits_status` and `solana_credits_status`, plus the opt-in `solana_credits_topup` (tier `pro`, both purchase caps required, reports `tokenKept`); no purchase tool on XRPL. CLI gains `topup`, `credits`, `rotate-token` (Solana) and per-command `--help`. Dependencies: `@solana/kit` 8.6.0 and `@x402/*` 2.30.0.
- a0bf36b: First version of the SDK: the core package (API client with typed errors, opt-in x402 pay-per-call with spend limits, MCP / AI SDK / Mastra / ElizaOS adapters and CLI runner) and the XRPL kit (typed client for every `/v1/xrpl/*` route, RLUSD x402 payer, payment preparation, DEX quote, 14 tools, ElizaOS plugin, `agent-apis-xrpl` CLI and agent guidance files).
- a2a7421: Hardening from the 2026-10-27 audit: Solana transfer preparation verifies the readiness against the intent (echoed source, destination and mint, SOL decimals, Token or Token-2022 program, raw amount equal to the intent amount) and refuses a mismatch with `invalid-response`; API problems carry their field errors in `details.errors`; the XRPL kit checks account lines (10 to 400) and transactions (1 to 50) limits before the request and advertises them in the tool schemas; the CLI also refuses `--key` and `--payer-key`.
- cca342c: Report the API's prepaid credits answers: a credits-only route raises `CriptonPaymentError` code `credits-required`, and payment and problem errors carry `prepaidOffer` and the problem's `error` member as `reason` (for example on an exhausted daily free quota). The kit still never buys credits.
- a2a7421: The XRPL kit is published as `@criptonlabs/agent-apis-xrpl` with the binary `agent-apis-xrpl`, the `User-Agent` product token `agent-apis-xrpl/<version>` and the MCP server name `criptonlabs-agent-apis-xrpl`; the package now has a description and search keywords.
- Updated dependencies [489f092]
- Updated dependencies [a0bf36b]
- Updated dependencies [a2a7421]
- Updated dependencies [cca342c]
- Updated dependencies [cca342c]
- Updated dependencies [a2a7421]
  - @criptonlabs/agent-apis-core@0.0.1
