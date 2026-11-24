---
name: agent-apis-solana
description: Check Solana network status, SPL token data and transfer readiness against the Criptonlabs Agent APIs, and prepare unsigned SOL or SPL token transfers, using the 7 tools of @criptonlabs/agent-apis-solana and its opt-in credit purchase tool.
---

# Criptonlabs Agent APIs: Solana

Typed, read-only access to the hosted Criptonlabs Agent APIs for Solana. The kit answers pre-transaction questions (network status, token safety, transfer readiness) and describes an unsigned transfer so an agent can avoid failed or unsafe transfers. The packages are pre-release and not yet published to npm.

## When to use

- Before building a SOL or SPL token transfer: check readiness (balance, token accounts, fees) and prepare the unsigned instructions.
- Before accepting or sending a token: read its mint data and safety verdict (`safe`, `warn` or `danger`).
- To check network health and the latest slot before relying on fresh data.

## Tools

- `solana_latest_slot`: latest slot and block time.
- `solana_network_health`: status (up, down, unknown or unavailable), latest slot, probe latency and last probe time.
- `solana_health_history`: health over a window (`1h`, `24h` or `7d`): time buckets with samples, uptime percent and average latency.
- `solana_token`: SPL mint data (token program, decimals, `supply` in display units and `supply_atomic` in base units, mint and freeze authorities, extensions, transfer fee) and a safety `verdict` (`safe`, `warn` or `danger`, the highest level matched) with every matched code in `reasons`. Takes a mint address only; `SOL` is not a mint.
- `solana_transfer_readiness`: whether a SOL or SPL token transfer between two wallets can succeed. Its `verdict` is `ready`, `not_ready` or `unknown`: `not_ready` on any blocking code in `reasons`, else `unknown` when `checks_failed` names a source or destination token account that exists but cannot be decoded, else `ready`. It also returns `warnings` and, in base units, `amount_atomic`, `transfer_fee_atomic` (Token-2022 fee, `null` without one) and `net_amount_atomic` (what the destination receives).
- `solana_prepare_transfer`: builds an unsigned transfer description after checking readiness. It never signs and never sends.
- `solana_credits_status`: whether a credit token is configured, whether SIWX spending is on, the last known credit balance per denomination (`null` before any credit-paid response) and the amount spent on top-ups in this process. It sends no request and never returns the token.
- `solana_credits_topup` (opt-in, listed only when the operator configured the purchase limits): buys one credit bundle (`bundle`, an id from the API's prepaid credits offer) with the wallet. It is the only tool that is not read-only: each call is a new purchase. It returns the purchase without the token (see Purchase limits).

Transfer inputs are `source`, `destination`, `mint` (a base58 mint address or `"SOL"`) and `amount`. Addresses and mints are base58 and must decode to 32 bytes. Amounts are decimal strings in the asset's units, never floats; SOL amounts have at most 9 decimals. Invalid inputs are rejected before any request.

## Prepared transfers

`solana_prepare_transfer` returns `{ transaction, readiness, ataCreation, meta }`:

- `transaction`: `feePayer`, `recentBlockhash` (always `null`) and `instructions`, each with `programAddress`, `accounts` (`address`, `signer`, `writable`) and base64 `data`.
- SOL uses a System transfer. SPL tokens use `TransferChecked` (Token or Token-2022 program), preceded by an idempotent associated token account creation when the destination needs one.
- `ataCreation`: `required` and the `lamports` it costs.

Before building, it verifies the readiness against the intent: `source`, `destination` and `mint` echo the intent, SOL has 9 decimals, an SPL token uses the Token or Token-2022 program, and `amount_atomic` equals the intent amount in base units. On a mismatch it refuses with `invalid-response` and builds nothing. It refuses with `transfer-not-ready` when the verdict is `not_ready`, and with `transfer-readiness-unknown` when it is `unknown` or any other value. The wallet sets the recent blockhash, signs and sends; the kit never does.

## Route families

- `/v1/solana/*`: free tier, the default.
- `/v1/pro/solana/*`: paid tier, same data. Every route is paid per call with x402 (USDC or EURC on Solana) or with prepaid credits; production (API 0.27.0) has no credits-only route. When the kit cannot pay (no payer or no `maxPerCall`), a paid answer raises `payment-disabled` carrying the API's credit offer in `details.prepaidOffer` and its `details.reason` when sent.
- `/v1/pro/credits/*`: prepaid credit purchases (`POST /v1/pro/credits/{bundle}`) and token rotation (`POST /v1/pro/credits/token`), used only on an explicit call.
- `/v1/pro/requirements`: the price index of the paid routes, free to read.

Prices are never fixed in the kit or in this file: they come from the API at runtime (`GET /v1/pro/requirements`, `kit.prices()` or `kit.priceOf(resource)`).

## Opt-in payment

Payment is off unless configured. The free tier needs no configuration. To use the paid tier set:

- `CRIPTON_TIER=pro`
- `CRIPTON_SOLANA_PAYER_KEY`: the payer secret key, base58 (64 bytes) or a JSON array of 64 integers, for example `CRIPTON_SOLANA_PAYER_KEY="$(cat id.json)"` for a `solana-keygen` file.
- `CRIPTON_MAX_PER_CALL`: mandatory cap per call, decimal string in the payment asset's units, compared with the gross amount the API offers (VAT included when the API quotes it).
- `CRIPTON_SESSION_BUDGET`: optional total budget for the session.
- `CRIPTON_SOLANA_PAY_ASSET`: `USDC` (default) or `EURC`. The kit never switches asset.
- `CRIPTON_SOLANA_NETWORK`: `mainnet` (default) or `devnet`.
- `CRIPTON_SOLANA_RPC_URL`: optional Solana RPC used while paying. The public RPC is rate-limited; use your own in production.

The kit never switches to the paid tier on its own and never pays without these variables.

## Prepaid credits

- `CRIPTON_CREDITS_TOKEN`: a prepaid credit token (`clc_...`, needs `CRIPTON_TIER=pro`). Paid-tier calls then carry it as `Authorization: Bearer`; the balance the API reports on credit-paid answers is what `solana_credits_status` shows.
- `CRIPTON_SOLANA_SIWX=on`: Sign-In-With-X (SIWX) spending. With `CRIPTON_TIER=pro`, `CRIPTON_SOLANA_PAYER_KEY` and no credit token, the kit answers the API's SIWX challenges with a signature of the wallet and spends the wallet's credits without a token. A configured token always comes first. `off` or unset leaves it off.
- A credit token is a secret, like a key: supply it only through the environment. No tool result or tool error ever contains it.
- A lost token is replaced with `agent-apis-solana rotate-token`, which signs a SIWX proof with the wallet and revokes the wallet's earlier tokens.

## Purchase limits

- A top-up needs its own maximum: `maxAmount` in code (`kit.credits.topup({ bundle, maxAmount })`), `--max` in the CLI (`agent-apis-solana topup <bundle> --max <amount>`). A bundle priced above it is refused before anything is signed.
- `maxPerCall` and `sessionBudget` never apply to purchases; they limit per-call payments only.
- `credits.topupBudget` (`CRIPTON_TOPUP_BUDGET`) caps the total of the process's purchases. A purchase whose answer is lost counts as spent.
- A credit token is shown once, when it is bought or rotated: store it in `CRIPTON_CREDITS_TOKEN` right away. A Solana wallet recovers its credits with `rotate-token`, which revokes the wallet's earlier tokens.
- `solana_credits_topup` exists only with tier `pro` (`CRIPTON_TIER=pro`), `CRIPTON_SOLANA_PAYER_KEY`, `CRIPTON_TOPUP_MAX` (its per-purchase maximum) and `CRIPTON_TOPUP_BUDGET` (its per-process budget). It keeps the bought token in process memory for later paid-tier calls and never shows it to the model. With a credit token already configured, it keeps using that token and does not keep the bought one.
- A `solana_credits_topup` error `payment-settlement-failed` with `details.eventId` means the API could not confirm the purchase: it may still settle and its amount already counts toward the top-up budget, so do not buy it again. Once the API reconciles the payment, the credits belong to the wallet and `agent-apis-solana rotate-token` gives it a token for them.
- Its result reports `tokenKept`: true when the bought token became the process's token. When `tokenKept` is false (a token was already configured, or the bought token could not be kept), the purchase still happened: `rotate-token` gives the wallet a token for its credits and revokes the wallet's earlier tokens.

## Reading results

Every response carries `meta` (`slot`, which may be `null`; `commitment` = `finalized`, `as_of`, `age_seconds`, `cache`, `stale`). If `meta.stale` is true, treat the data as possibly out of date.

## Errors

Tool errors have the shape `{ code, message, ... }` (for example validation, problem, payment, refusal or network errors). Read `code` and `message`; do not retry blindly. `transfer-not-ready` carries the API `reasons` in `details.reasons` and its `warnings` in `details.warnings`; `transfer-readiness-unknown` carries the same plus the API `checks_failed` in `details.checksFailed`. Do not send the transfer in either case. When the API names the failing fields (for example `invalid-parameters`), `details.errors` lists them with `field` and `message`; fix those inputs. `credits-required` means the route is paid only with prepaid credits; when `details.prepaidOffer` is present (also on a free-tier 429), tell the user about the offer instead of retrying. Credits are bought only through `solana_credits_topup` when the operator configured it, the CLI `topup` command or the programmatic `kit.credits.topup`; never automatically.

## Safety

- Never paste a secret key or a credit token into a prompt, a file, a command-line argument or a log. Supply it only through the environment.
- `solana_prepare_transfer` output is unsigned; review it before any signing happens elsewhere.
- Do not hardcode prices or amounts to pay.

## Disclaimer

Free open-source software (Apache-2.0) provided as is, without warranty. The kit itself is never charged for; only the hosted API charges its paid calls, and only when payment is configured. Nothing here is financial, legal or tax advice. The user is solely responsible for its use, keys and transactions, and assumes all risks. See the package README.
