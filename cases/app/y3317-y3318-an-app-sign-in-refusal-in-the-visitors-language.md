# app/y3317-y3318-an-app-sign-in-refusal-in-the-visitors-language

**T7936** — fixed in `fd7ab2fc8`.

## What the user sees

A visitor to a published app whose sign-in is switched off asks for a code
and reads the refusal in English, on a page in French or German.

## What the checkpoint asserts

The send-code request answers 400 with
`data.localization.i18nKey = httpErrors.app.auth.loginDisabled`, and the
message itself is the French text under `Accept-Language: fr`, the German
text under `de`, and the English text when no language is sent. The expected
texts are the ones in teable-ee's own `sdk.json`.

## What the fixture has to hold

An app created for the run, which has no sign-in configured, so the
production sign-in is off. It is deleted afterwards. The request is made as
the app's owner rather than an anonymous visitor: anonymous visitors are let
in only for a published app, and the test environment has no deployment
target to publish to. The owner passes the same permission check and reaches
the same sign-in code and translation.

Observed before #4020 (`73b3cd75d`), as an anonymous request: 401
Unauthorized for the unpublished app - which is why the owner is used.
