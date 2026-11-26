---
"@criptonlabs/agent-apis-core": minor
"@criptonlabs/agent-apis-xrpl": patch
---

Concurrent XRPL payments no longer collide. Core: the `X402Payer` port gains an optional `exclusive` section that the paid flow (per-call payments and top-ups) runs signing and the paid retry inside, and a new payment error code `payment-busy` for a payment that could not start. XRPL: payments of one wallet and network are signed one at a time per process, and a payment that waits more than 20 seconds fails with `payment-busy`, unsigned and not charged.
