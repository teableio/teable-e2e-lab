# auth/y3314-an-unregistered-email-in-your-language

**sentinel/reset-email-unregistered-key** — sentinel.

## What the user sees

Someone types an email that has no account into the forgot-password form;
they read "this email is not registered" in their own language only if the
response names the key.

## What the checkpoint asserts

An anonymous request for a reset email for an unregistered address answers
400 with `data.localization.i18nKey = httpErrors.auth.emailNotRegistered`.

## What the fixture has to hold

A fresh address per run that has never signed up. A sentinel, for the same
reason as the share password case: green on every column unless the key is
dropped.
