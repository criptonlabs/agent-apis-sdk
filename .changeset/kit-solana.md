---
"@criptonlabs/agent-apis-solana": minor
"@criptonlabs/agent-apis-core": minor
---

New Solana kit `@criptonlabs/agent-apis-solana`: typed client for the `/v1/solana/*` routes, unsigned SOL / SPL (Token and Token-2022) transfer preparation gated by the API's transfer readiness, an opt-in x402 payer in USDC or EURC (fixed asset, official mints, `mainnet` or `devnet`), six tools for MCP, AI SDK, Mastra and ElizaOS, and the `agent-apis-solana` CLI. Core: payers may report a decimal amount (`X402Payer.decimalAmount`) so spend limits and receipts use decimal units when a network offers atomic amounts, and the money module gains `divPow10`.
