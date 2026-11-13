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

## End-to-end checks on the test networks

The suites in `packages/xrpl/tests/e2e/` (XRPL testnet) and `packages/solana/tests/e2e/` (Solana devnet) pay real test-network transactions through a local copy of the API. They are opt-in (`CRIPTON_E2E=1`, set by each package's `test:e2e` script) and stay excluded from `pnpm test` and CI.

### Who may run them

- People and automated agents may run them on Solana devnet and XRPL testnet (standing rule of the maintainer, 2026-11-12). Never with mainnet keys, seeds or RPC URLs.
- Funding the payers (testnet RLUSD, devnet USDC and EURC) is done by a person. Agents never request faucet funds.
- The API repository (`../kryptonianlabs-apis`) is read only: no edit, no install, no dev server and no writing git command inside it. The only git command run on it is `git archive` (with the read-only `git rev-parse` that checks the revision).

### Local API stack

`scripts/e2e-api-stack.mjs` runs the API's released main revision without touching the API repository. It needs Node 26 and pnpm 11.28.4 installed through Corepack (the script runs that `pnpm.cjs`).

```bash
node scripts/e2e-api-stack.mjs start                        # API stack on http://localhost:8787
node scripts/e2e-api-stack.mjs run <xrpl|solana> [filter]   # ECB trigger, then a kit's test:e2e
```

- `start` (no arguments) exports the API's released main revision with `git archive` into the gitignored `.e2e-api/<rev>/` of this repository (once; a marker file records a complete export), runs `pnpm install --frozen-lockfile` inside the export, writes fresh per-run test secrets and local overrides to `.e2e-api/<rev>/sdk-e2e.env` (mode 0600; `PUBLIC_ORIGIN=http://localhost:8787` and an empty `XRPL_TESTNET_ISSUER_OVERRIDE`), and starts the export's Workers with the API's env files (`.dev.vars`, `.env.solana-data`, `.env.solana-devnet`, `.env.xrpl-testnet`, read in place, never copied) followed by the generated file, passing `--test-scheduled` to every `wrangler dev` (the local stack never fires cron triggers by itself). It refuses to start unless the merged environment has `SOLANA_NETWORK=devnet`, `XRPL_NETWORK=testnet` and no mainnet `SOLANA_RPC_URL`.
- `run <xrpl|solana> [filter]` needs a gateway answering on `http://localhost:8787`. It first fires the billing Worker's ECB trigger once (`GET http://localhost:8987/__scheduled?cron=15+15+*+*+1-5`, the public ECB daily feed), because the ledger values USD amounts with the latest ECB rate, and stops unless it answers 200. Then it runs `pnpm -C packages/<kit> test:e2e [filter]` with `CRIPTON_E2E_BASE_URL` set to the gateway. The payer secrets are read in memory from the API's env files: for `xrpl`, `XRPL_TESTNET_PAYER_SEED` as `CRIPTON_XRPL_PAYER_SEED` with `CRIPTON_XRPL_NETWORK=testnet`; for `solana`, the 32-byte hex `X402_E2E_CLIENT_SEED` expanded to `CRIPTON_SOLANA_PAYER_KEY`, its address as `CRIPTON_E2E_SOLANA_SOURCE`, and `CRIPTON_SOLANA_NETWORK=devnet`. Set `CRIPTON_SOLANA_PAY_ASSET` (`USDC` default, or `EURC`) in your shell to choose the Solana asset.
- The script never prints an env value, seed or key, and writes none except the generated test secrets in `sdk-e2e.env`.

### Guards

- Every suite refuses a `CRIPTON_E2E_BASE_URL` other than localhost, 127.0.0.1 or [::1].
- The XRPL suite requires `CRIPTON_XRPL_NETWORK=testnet` and the Solana suite `CRIPTON_SOLANA_NETWORK=devnet`.
- The kit pays only the official RLUSD issuer of each network; there is no issuer override.

### Payers and the XRPL testnet reset

- The XRPL payer needs a trust line to the official testnet RLUSD issuer and some testnet RLUSD. The Solana payer needs devnet USDC or EURC.
- The XRPL testnet resets on 2026-11-25. After the reset, the XRPL suites run only once a person confirms that the payer holds official testnet RLUSD again; the kit keeps refusing any other issuer.

## Reporting security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
