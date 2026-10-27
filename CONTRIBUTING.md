# Contributing

Thanks for helping. This repository is pre-release and private; the rules below apply to every change.

## Prerequisites

- Node.js 24 (CI uses 24; packages support >= 22.18).
- pnpm 11 (pinned by `packageManager`; use Corepack).
- gitleaks v8.30.1, installed locally. The pre-commit hook fails closed without it.

## Setup

```bash
pnpm install
```

`pnpm install` runs the `prepare` script, which sets `git config core.hooksPath .githooks` and enables the hooks:

- `pre-commit`: gitleaks on the staged changes, `pnpm lint` and `pnpm typecheck`.
- `pre-push`: `pnpm test` (with coverage thresholds), `pnpm build` and `pnpm test:exports`.

Both fail closed. Lint enforces cyclomatic complexity <= 8, nesting depth <= 2, no dynamic code evaluation and the `eslint-plugin-security` rules (see `vite.config.ts`); refactor rather than disable a rule. CI runs the same checks plus the history scan, the secret rule verification, the dependency audit and `npm pack`.

## Commands

Run from the repository root:

| Task                     | Command                           |
| ------------------------ | --------------------------------- |
| Install                  | `pnpm install`                    |
| Typecheck                | `pnpm typecheck`                  |
| Lint and format check    | `pnpm lint`                       |
| Tests (with coverage)    | `pnpm test`                       |
| Build                    | `pnpm build`                      |
| Built-entry import check | `pnpm test:exports` (after build) |
| Dependency audit         | `pnpm audit --audit-level high`   |

Before opening a pull request, run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` and make sure it is green.

## Test-driven workflow

1. Write the test for one scenario first.
2. Run it and confirm it fails for the right reason (an assertion about behavior, not a missing import).
3. Write the minimal code to pass.
4. Refactor with the tests green.

Do one scenario at a time. Never write code and tests together. Amounts are decimal strings and decimal math goes only through the core money module, never floats.

## Changesets

Every pull request that changes behavior adds a changeset:

```bash
pnpm changeset
```

Versions are independent per package. Do not edit versions by hand.

## Commit style

Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, and so on. Keep each commit focused.

## Secrets policy

- Never commit seeds, private keys, tokens or `.env` files with values.
- Tests generate any key material at runtime; no real or sample secret is committed.
- The gitleaks hook and CI scan reject XRPL seeds, Solana keys, `clc_` tokens and `CRIPTON_*_SEED=`, `CRIPTON_*_SECRET=` or `CRIPTON_*_KEY=` style assignments. Do not bypass the hook.

## XRPL testnet end-to-end check (human-approved only)

`pnpm -C packages/xrpl test:e2e` is an opt-in check excluded from `pnpm test` and CI. It must be run by a person, never by an automated agent. It needs:

- `CRIPTON_E2E_BASE_URL`: URL of a local Worker with the XRPL payment rail on testnet (localhost, 127.0.0.1 or [::1]; other hosts are refused).
- `CRIPTON_XRPL_NETWORK=testnet`.
- `CRIPTON_XRPL_PAYER_SEED`: a testnet seed, taken from the environment and never written to a file.

The payer needs a trust line to the official testnet RLUSD issuer and some testnet RLUSD; the kit pays only official RLUSD. If the Worker's environment sets an own test issuer (`XRPL_TESTNET_ISSUER_OVERRIDE`), start it with a last `--env-file` that clears that variable. The check calls `payment-readiness`, a route paid per call.

## Solana devnet end-to-end check (human-approved only)

`pnpm -C packages/solana test:e2e` is opt-in and excluded from `pnpm test` and CI. It pays one `transfer-readiness` call on Solana devnet through a local Worker and needs:

- `CRIPTON_E2E_BASE_URL`: URL of a local Worker with Solana payments on devnet and Solana data configured (localhost, 127.0.0.1 or [::1] only).
- `CRIPTON_SOLANA_NETWORK=devnet`, optional `CRIPTON_SOLANA_PAY_ASSET` (`USDC` default or `EURC`).
- `CRIPTON_SOLANA_PAYER_KEY`: a devnet key funded with devnet USDC or EURC, taken from the environment and never written to a file.
- `CRIPTON_E2E_SOLANA_SOURCE`: the payer's address, used as the readiness source.

## Reporting security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
