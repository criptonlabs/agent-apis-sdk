---
"@criptonlabs/agent-apis-core": minor
---

The signed retry waits at least 30 seconds for settlement; when it fails without an answer the amount counts toward the session spend and the client raises `CriptonPaymentError` code `payment-outcome-unknown` instead of a network error, never retrying the payment.
