# app/y3319-an-expired-app-sign-in-in-the-visitors-language

**T7936** — fixed in `fd7ab2fc8`.

## What the user sees

A visitor who comes back to an app's sign-in after it expired reads why in
English, whatever the app page's language.

## What the checkpoint asserts

The anonymous callback request answers 400 with
`data.localization.i18nKey = httpErrors.app.auth.signInStateInvalid`, and the
message is the Japanese text under `ja`, the German text under `de`, and the
English text when no language is sent.

## What the fixture has to hold

A state value made up per run, so it can never be in the sign-in cache; no
app is needed for the callback to refuse it.
