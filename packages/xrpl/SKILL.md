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
- `xrpl_orderbook`: funded order book of a market; optional `domain` reads a permissioned order book.
- `xrpl_slippage`: estimated slippage of buying or selling (`side`, default `buy`) on the order book and the AMM, and the best venue; optional `domain`.
- `xrpl_amm`: AMM pool reserves and trading fee (`trading_fee_pct`) for a pair.
- `xrpl_account_summary`: XRP balance, sequence, owner count, transfer fee percent (`transfer_fee_pct`) and trust lines.
- `xrpl_account_lines`: trust lines of an account, paginated with a marker.
- `xrpl_account_transactions`: recent transactions of an account, paginated with a marker.
- `xrpl_token`: issuer, transfer fee, freeze and authorization flags, domain and outstanding obligations of an issued token.
- `xrpl_payment_readiness`: whether a payment can succeed, with reasons; optional `credentials` (credential entry ids) for the `deposit_authorized` check.
- `xrpl_paths`: multi-hop payment paths for a cross-currency payment (can take up to about 20 seconds).
- `xrpl_prepare_payment`: builds an unsigned `Payment` after checking readiness, finding a path and choosing a fee. It never signs and never submits.
- `xrpl_dex_quote`: quote for buying a base amount on the DEX; refuses above a slippage limit.
- `xrpl_credits_status`: whether a credit token is configured, the last known credit balance per denomination (`null` before any credit-paid response) and the amount spent on top-ups in this process. It sends no request and never returns the token.

Assets are written `"XRP"` or `"CODE.issuer"`: `CODE` is a case-sensitive 3-character code (`usd` and `USD` are different tokens) or a 40-hex code, and `issuer` is a classic XRPL address, for example `USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B`. A longer code such as RLUSD is written in its 40-hex form: `524C555344000000000000000000000000000000.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De`. Amounts are decimal strings, never floats.

Tool inputs:

- `depth` (`xrpl_orderbook`, `xrpl_slippage`, `xrpl_dex_quote`): an integer from 1 to 9007199254740991; the API serves it in buckets of 10, 50 or 100 levels per side, reported as `depth_effective`.
- `side` (`xrpl_slippage`): `buy` (the API default) or `sell`.
- `domain` (`xrpl_orderbook`, `xrpl_slippage`): a PermissionedDomain id (64 hex characters); slippage then does not read the AMM.
- `credentials` (`xrpl_payment_readiness`): 1 to 8 distinct credential entry ids, 64 hex characters each.
- `asset` (`xrpl_payment_readiness` only): also a 48-hex MPT issuance id, for example `0000012FFD9EE5DA93AC614B4DB94D7E0FCE415CA51BED47`, with `amount` in whole base units.

## Route families

- `/v1/xrpl/*`: free tier, the default.
- `/v1/pro/xrpl/*`: paid tier, same data, paid per call with x402 or with prepaid credits; production (API 0.27.0) has no credits-only route.
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

Paid calls from one XRPL wallet are paid one at a time in a process: each payment waits for the previous paid retry to answer. A payment that waits more than 20 seconds fails with `payment-busy`, with nothing signed or charged. Payments are not serialized across processes: two processes sharing one wallet can still sign two payments with the same sequence, and one of them is refused and never charged.

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

Every response carries `meta` (`ledger_index`, which may be `null`; `ledger_state`, `as_of`, `age_seconds`, `cache`, `stale`). If `meta.stale` is true, treat the data as possibly out of date.

In a slippage answer, `partial` is true when `filled` is above 0 and below `amount`; a partial fill reports `avg_price`, `slippage_pct` and `avg_price_after_fees` of the filled part, and `venues.clob` then carries `null` prices and is never `best`.

## Errors

Tool errors have the shape `{ code, message, ... }` (for example validation, problem, payment, refusal or network errors). Read `code` and `message`; do not retry blindly. `credits-required` means the route is paid only with prepaid credits; when `details.prepaidOffer` is present (also on a free-tier 429), tell the user about the offer instead of retrying. No tool buys credits.

## Safety

- Never paste a seed, private key or credit token into a prompt, a file, a command-line argument or a log. Supply it only through the environment.
- `xrpl_prepare_payment` output is unsigned; review it before any signing happens elsewhere.
- Do not hardcode prices or amounts to pay.

## Disclaimer

Free open-source software (Apache-2.0) provided as is, without warranty. The kit itself is never charged for; only the hosted API charges its paid calls, and only when payment is configured. Nothing here is financial, legal or tax advice. The user is solely responsible for its use, keys and transactions, and assumes all risks. See the package README.
