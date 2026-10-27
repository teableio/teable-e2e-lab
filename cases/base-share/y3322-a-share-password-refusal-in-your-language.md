# base-share/y3322-a-share-password-refusal-in-your-language

**sentinel/share-auth-password-key** — sentinel.

## What the user sees

Someone opens a shared base's password page and submits a password for a
share that has none; the reason is shown in their own language only if the
response names the key.

## What the checkpoint asserts

An anonymous submission to the share's password endpoint answers 400 with
`data.localization.i18nKey = httpErrors.shareAuth.passwordRestrictionNotEnabled`.

## What the fixture has to hold

A whole-base share created for the run without a password, removed
afterwards. This is a sentinel: the server already sent the key before #4020
(fd7ab2fc8), which changed the page that shows it, so the case is green on
every column; it fails only if the key is dropped.
