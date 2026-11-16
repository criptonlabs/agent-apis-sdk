---
"@criptonlabs/agent-apis-core": patch
"@criptonlabs/agent-apis-xrpl": patch
---

Report the API's prepaid credits answers: a credits-only route raises `CriptonPaymentError` code `credits-required`, and payment and problem errors carry `prepaidOffer` and the problem's `error` member as `reason` (for example on an exhausted daily free quota). The kit still never buys credits.
