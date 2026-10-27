---
"@criptonlabs/agent-apis-core": patch
"@criptonlabs/agent-apis-xrpl": patch
"@criptonlabs/agent-apis-solana": patch
---

Hardening from the 2026-10-27 audit: Solana transfer preparation verifies the readiness against the intent (echoed source, destination and mint, SOL decimals, Token or Token-2022 program, raw amount equal to the intent amount) and refuses a mismatch with `invalid-response`; API problems carry their field errors in `details.errors`; the XRPL kit checks account lines (10 to 400) and transactions (1 to 50) limits before the request and advertises them in the tool schemas; the CLI also refuses `--key` and `--payer-key`.
