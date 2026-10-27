---
name: agent-apis-solana
description: Check Solana network status, SPL token data and transfer readiness against the Criptonlabs Agent APIs, and prepare unsigned SOL or SPL token transfers, using the 6 tools of @criptonlabs/agent-apis-solana.
---

# Criptonlabs Agent APIs: Solana

Typed, read-only access to the hosted Criptonlabs Agent APIs for Solana. The kit answers pre-transaction questions (network status, token safety, transfer readiness) and describes an unsigned transfer so an agent can avoid failed or unsafe transfers. The packages are pre-release and not yet published to npm.

## When to use

- Before building a SOL or SPL token transfer: check readiness (balance, token accounts, fees) and prepare the unsigned instructions.
- Before accepting or sending a token: read its mint data and safety verdict.
- To check network health and the latest slot before relying on fresh data.

## Tools

- `solana_latest_slot`: latest slot and block time.
- `solana_network_health`: status (up, down, unknown or unavailable), latest slot, probe latency and last probe time.
- `solana_health_history`: health over a window (`1h`, `24h` or `7d`): time buckets with samples, uptime percent and average latency.
- `solana_token`: SPL mint data (token program, decimals, supply, mint and freeze authorities, extensions, transfer fee) and a safety verdict with reasons. Takes a mint address only; `SOL` is not a mint.
- `solana_transfer_readiness`: whether a SOL or SPL token transfer between two wallets can succeed, with blockers and warnings.
- `solana_prepare_transfer`: builds an unsigned transfer description after checking readiness. It never signs and never sends.

Transfer inputs are `source`, `destination`, `mint` (a base58 mint address or `"SOL"`) and `amount`. Addresses and mints are base58 and must decode to 32 bytes. Amounts are decimal strings in the asset's units, never floats; SOL amounts have at most 9 decimals. Invalid inputs are rejected before any request.

## Prepared transfers

`solana_prepare_transfer` returns `{ transaction, readiness, ataCreation, meta }`:

- `transaction`: `feePayer`, `recentBlockhash` (always `null`) and `instructions`, each with `programAddress`, `accounts` (`address`, `signer`, `writable`) and base64 `data`.
- SOL uses a System transfer. SPL tokens use `TransferChecked` (Token or Token-2022 program), preceded by an idempotent associated token account creation when the destination needs one.
- `ataCreation`: `required` and the `lamports` it costs.

Before building, it verifies the readiness against the intent: `source`, `destination` and `mint` echo the intent, SOL has 9 decimals, an SPL token uses the Token or Token-2022 program, and `amount_raw` equals the intent amount in base units. On a mismatch it refuses with `invalid-response` and builds nothing. It refuses with `transfer-not-ready` when the readiness verdict is not ready. The wallet sets the recent blockhash, signs and sends; the kit never does.

## Route families

- `/v1/solana/*`: free tier, the default.
- `/v1/pro/solana/*`: paid tier, same data. Most paid routes accept only prepaid credits (`credits-required`); per-call x402 payment applies where the API offers it (today transfer readiness).

Prices are never fixed in the kit or in this file: they come from the API at runtime (`kit.priceOf(resource)`).

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

## Reading results

Every response carries `meta` (`slot`, `commitment` = `finalized`, `as_of`, `age_seconds`, `cache`, `stale`). If `meta.stale` is true, treat the data as possibly out of date.

## Errors

Tool errors have the shape `{ code, message, ... }` (for example validation, problem, payment, refusal or network errors). Read `code` and `message`; do not retry blindly. `transfer-not-ready` carries the API blockers in `details.reasons` and `details.warnings`. When the API names the failing fields (for example `invalid-parameters`), `details.errors` lists them with `field` and `message`; fix those inputs. `credits-required` means the route is paid only with prepaid credits; when `details.prepaidOffer` is present (also on a free-tier 429), tell the user about the offer instead of retrying. The kit never buys credits.

## Safety

- Never paste a secret key into a prompt, a file, a command-line argument or a log. Supply it only through the environment.
- `solana_prepare_transfer` output is unsigned; review it before any signing happens elsewhere.
- Do not hardcode prices or amounts to pay.

## Disclaimer

Free open-source software (Apache-2.0) provided as is, without warranty. The kit itself is never charged for; only the hosted API charges its paid calls, and only when payment is configured. Nothing here is financial, legal or tax advice. The user is solely responsible for its use, keys and transactions, and assumes all risks. See the package README.
