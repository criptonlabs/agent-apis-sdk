---
name: agent-apis-xrpl
description: Check XRP Ledger payments, DEX liquidity and fees against the Criptonlabs Agent APIs before building or submitting a transaction, using the 15 tools of @criptonlabs/agent-apis-xrpl.
---

# Criptonlabs Agent APIs: XRP Ledger

Typed, read-only access to the hosted Criptonlabs Agent APIs for the XRP Ledger. The kit answers pre-transaction questions (fees, readiness, liquidity, paths) so an agent can avoid failures such as `tecPATH_DRY`, `tecNO_LINE` or a missing destination tag. The packages are pre-release and not yet published to npm.

## When to use

- Before building or submitting a payment: check readiness, find a path, choose a fee.
- Before a DEX or AMM trade: read the funded order book, slippage and the best venue.
- To inspect an account, its trust lines and recent transactions, or an issued token.
- To check network health before relying on fresh data.

## Tools

- `xrpl_fee`: current fee tiers in drops and the congestion band.
- `xrpl_network_health`: status (ok, degraded, down or unknown), latest ledger index and per-node probe results.
- `xrpl_latest_ledger`: latest validated ledger (index, hash, close time).
- `xrpl_orderbook`: funded order book of a market.
- `xrpl_slippage`: estimated slippage on the order book and the AMM, and the best venue.
- `xrpl_amm`: AMM pool reserves and trading fee for a pair.
- `xrpl_account_summary`: XRP balance, sequence, owner count, transfer rate and trust lines.
- `xrpl_account_lines`: trust lines of an account, paginated with a marker.
- `xrpl_account_transactions`: recent transactions of an account, paginated with a marker.
- `xrpl_token`: issuer, transfer fee, freeze and authorization flags, domain and outstanding obligations of an issued token.
- `xrpl_payment_readiness`: whether a payment can succeed, with reasons.
- `xrpl_paths`: multi-hop payment paths for a cross-currency payment (can take up to about 20 seconds).
- `xrpl_prepare_payment`: builds an unsigned `Payment` after checking readiness, finding a path and choosing a fee. It never signs and never submits.
- `xrpl_dex_quote`: quote for buying a base amount on the DEX; refuses above a slippage limit.
- `xrpl_credits_status`: whether a credit token is configured, the last known credit balance per denomination (`null` before any credit-paid response) and the amount spent on top-ups in this process. It sends no request and never returns the token.

Assets are written `"XRP"` or `"<currency>.<issuer>"`. Amounts are decimal strings, never floats.

## Route families

- `/v1/xrpl/*`: free tier, the default.
- `/v1/pro/xrpl/*`: paid tier, same data, paid with prepaid credits or, on the routes where the API offers it, per call with x402.
- `/v1/pro/credits/*`: prepaid credit purchases (`POST /v1/pro/credits/{bundle}`), used only by an explicit top-up.
- `/v1/pro/requirements`: the price index of the paid routes, free to read.

Prices are never fixed in the kit or in this file: they come from the API at runtime (`GET /v1/pro/requirements`, `kit.prices()` or `kit.priceOf(resource)`).

## Opt-in payment

Payment is off unless configured. The free tier needs no configuration. To use the paid tier set:

- `CRIPTON_TIER=pro`
- `CRIPTON_XRPL_PAYER_SEED`: the payer seed (RLUSD on the XRP Ledger only).
- `CRIPTON_MAX_PER_CALL`: mandatory cap per call, decimal string, compared with the gross amount the API offers.
- `CRIPTON_SESSION_BUDGET`: optional total budget for the session.
- `CRIPTON_XRPL_NETWORK`: `mainnet` (default) or `testnet`.
- `CRIPTON_XRPL_WS_URL`: optional XRPL WebSocket node used while paying.

The kit never switches to the paid tier on its own and never pays without these variables.

## Prepaid credits

- `CRIPTON_CREDITS_TOKEN`: a prepaid credit token (`clc_...`, needs `CRIPTON_TIER=pro`). Paid-tier calls then carry it as `Authorization: Bearer`; the balance the API reports on credit-paid answers is what `xrpl_credits_status` shows.
- A credit token is a secret, like a seed: supply it only through the environment. No tool result or tool error ever contains it.

## Purchase limits

- A top-up needs its own maximum: `maxAmount` in code (`kit.credits.topup({ bundle, maxAmount })`), `--max` in the CLI (`agent-apis-xrpl topup <bundle> --max <amount>`). A bundle priced above it is refused before anything is signed.
- `maxPerCall` and `sessionBudget` never apply to purchases; they limit per-call payments only.
- `credits.topupBudget`, set in code, caps the total of the process's purchases.
- `CRIPTON_TOPUP_MAX` and `CRIPTON_TOPUP_BUDGET` are Solana settings (the per-purchase maximum of `solana_credits_topup` and the cap on a process's Solana top-ups); the XRPL kit ignores them (the core still checks that they are set together or not at all). The XRPL purchase limits are `--max` in the CLI, and `maxAmount` with `credits.topupBudget` in code.
- A credit token is shown once, when it is bought: store it in `CRIPTON_CREDITS_TOKEN` right away. An XRPL wallet cannot recover a lost credit token (there is no token rotation on XRPL).
- No tool buys credits in the XRPL kit. Top-ups happen only through the programmatic `kit.credits.topup` and the CLI `topup` command.

## Reading results

Every response carries `meta` (`ledger_index`, `as_of`, `age_seconds`, `cache`, `stale`). If `meta.stale` is true, treat the data as possibly out of date.

## Errors

Tool errors have the shape `{ code, message, ... }` (for example validation, problem, payment, refusal or network errors). Read `code` and `message`; do not retry blindly. `credits-required` means the route is paid only with prepaid credits; when `details.prepaidOffer` is present (also on a free-tier 429), tell the user about the offer instead of retrying. No tool buys credits.

## Safety

- Never paste a seed, private key or credit token into a prompt, a file, a command-line argument or a log. Supply it only through the environment.
- `xrpl_prepare_payment` output is unsigned; review it before any signing happens elsewhere.
- Do not hardcode prices or amounts to pay.

## Disclaimer

Free open-source software (Apache-2.0) provided as is, without warranty. The kit itself is never charged for; only the hosted API charges its paid calls, and only when payment is configured. Nothing here is financial, legal or tax advice. The user is solely responsible for its use, keys and transactions, and assumes all risks. See the package README.
