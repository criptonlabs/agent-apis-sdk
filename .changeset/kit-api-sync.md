---
"@criptonlabs/agent-apis-core": minor
"@criptonlabs/agent-apis-xrpl": minor
"@criptonlabs/agent-apis-solana": minor
---

Sync with the released API 0.21.0. BREAKING (pre-release): kit configuration is split into `wallet` (signer, network, asset, URLs), `payment` (the per-call opt-in: `maxPerCall`, `sessionBudget`) and `credits` (`token`, `topupBudget`, and `siwx` on Solana); environment variable names stay. Prepaid credits: spend with a token read from `CRIPTON_CREDITS_TOKEN`, last known balance, idempotency keys, and explicit top-ups with their own `maxAmount` (never `maxPerCall`) and an optional top-up budget; a bought token is shown once and never serialized, logged or handed to a tool result. Solana kit: Sign-In-With-X credit spending and token rotation (`@x402/extensions` as an optional peer). New free price index `prices()`, and API-owned code lists (reasons, warnings, statuses) tolerate unknown values instead of failing with `invalid-response`. New tools `xrpl_credits_status` and `solana_credits_status`, plus the opt-in `solana_credits_topup` (tier `pro`, both purchase caps required, reports `tokenKept`); no purchase tool on XRPL. CLI gains `topup`, `credits`, `rotate-token` (Solana) and per-command `--help`. Dependencies: `@solana/kit` 8.6.0 and `@x402/*` 2.30.0.
