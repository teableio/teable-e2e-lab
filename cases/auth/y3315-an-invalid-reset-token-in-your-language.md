# auth/y3315-an-invalid-reset-token-in-your-language

**sentinel/reset-token-invalid-key** — sentinel.

## What the user sees

Someone follows an expired or mistyped reset link and submits a new
password; they read "the token is invalid or has expired" in their own
language only if the response names the key.

## What the checkpoint asserts

An anonymous reset with a token that was never issued answers 400 with
`data.localization.i18nKey = httpErrors.auth.tokenInvalid`.

## What the fixture has to hold

A token made up per run and a password that satisfies the sign-up rules,
so the refusal is about the token rather than the password. A sentinel: green
on every column unless the key is dropped.
