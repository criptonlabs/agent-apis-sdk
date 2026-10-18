---
name: xrpl-agent-kit
description: Check XRP Ledger payments, DEX liquidity and fees against the Criptonlabs Agent APIs before building or submitting a transaction, using the 14 tools of @criptonlabs/xrpl-agent-kit.
---

# XRPL Agent Kit

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

Assets are written `"XRP"` or `"<currency>.<issuer>"`. Amounts are decimal strings, never floats.

## Route families

- `/v1/xrpl/*`: free tier, the default.
- `/v1/pro/xrpl/*`: paid tier, same data, paid per call with x402. `GET /v1/pro/requirements` lists the payment options.

Prices are never fixed in the kit or in this file: they come from the API at runtime (`GET /v1/pro/requirements`, or `kit.priceOf(resource)`).

## Opt-in payment

Payment is off unless configured. The free tier needs no configuration. To use the paid tier set:

- `CRIPTON_TIER=pro`
- `CRIPTON_XRPL_PAYER_SEED`: the payer seed (RLUSD on the XRP Ledger only).
- `CRIPTON_MAX_PER_CALL`: mandatory cap per call, decimal string.
- `CRIPTON_SESSION_BUDGET`: optional total budget for the session.
- `CRIPTON_XRPL_NETWORK`: `mainnet` (default) or `testnet`.
- `CRIPTON_XRPL_WS_URL`: optional XRPL WebSocket node used while paying.

The kit never switches to the paid tier on its own and never pays without these variables.

## Reading results

Every response carries `meta` (`ledger_index`, `as_of`, `age_seconds`, `cache`, `stale`). If `meta.stale` is true, treat the data as possibly out of date.

## Errors

Tool errors have the shape `{ code, message, ... }` (for example validation, problem, payment, refusal or network errors). Read `code` and `message`; do not retry blindly.

## Safety

- Never paste a seed or private key into a prompt, a file, a command-line argument or a log. Supply it only through the environment.
- `xrpl_prepare_payment` output is unsigned; review it before any signing happens elsewhere.
- Do not hardcode prices or amounts to pay.

## Disclaimer

Free open-source software (Apache-2.0) provided as is, without warranty. The kit itself is never charged for; only the hosted API charges its paid calls, and only when payment is configured. Nothing here is financial, legal or tax advice. The user is solely responsible for its use, keys and transactions, and assumes all risks. See the package README.
