# Security policy

## Supported versions

The project is pre-release and nothing is published to npm yet. Only the latest commit on `main` is supported.

## Reporting a vulnerability

Use GitHub private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue, pull request or discussion for a vulnerability.

Please include:

- The affected package and version or commit.
- A description of the issue and its impact.
- Steps to reproduce, ideally a minimal example.
- Any suggested fix or mitigation.

Never include real seeds, private keys or tokens in a report. Use throwaway testnet keys if a key is needed to reproduce.

## Scope

- This SDK: `@criptonlabs/agent-apis-core` and `@criptonlabs/xrpl-agent-kit`, including the CLI, the MCP server and the framework adapters.
- Issues in the hosted Criptonlabs Agent APIs may also be reported through this channel.

## What to expect

Reports are reviewed on a best-effort basis; there are no fixed response or fix times. We aim to acknowledge a report, confirm or dismiss it, and tell you when a fix lands. Please allow time to fix an issue before disclosing it publicly.

## Safe harbor

We consider good-faith research that follows this policy, avoids harm to others and stays within your own accounts and test funds to be authorized, and we will not pursue action against it.

## Key handling for users

- Provide the payer seed only through the environment (`CRIPTON_XRPL_PAYER_SEED`), never in code, prompts, logs or command-line arguments.
- Use a dedicated payer wallet holding only what you are willing to spend.
- Always set `CRIPTON_MAX_PER_CALL` (mandatory to pay) and consider `CRIPTON_SESSION_BUDGET`.
- Prepared payments are unsigned; review them before signing elsewhere.
- If a seed may have leaked, move the funds and stop using that wallet.
