# authority/a-signup-token-that-holds-its-code

**T7355** — fixed (released before this case was written). On the
`signup-token-carries-no-code` runner.

## What the user sees

Nothing - which is the problem. Signing up with an email address mails a
short code to it, and the person proves they own the address by typing the
code back. The request that sends the code also hands back a token to return
with it. That token was a signed JWT with the code inside. Signed is not
encrypted: anyone holding the token could read the code without the mail, so
addresses were "verified" that nobody could receive mail at. Accounts were
registered that way to collect free credits.

## What the checkpoint asserts

The token's payload - read the way anyone could read it, by base64-decoding
its middle part, with no key - carries no `code` and no value that looks like
a short numeric code.

## Why the fixture is shaped this way

A new address per run, `e2e-lab-signup-token-<runId>@example.com`: sending a
code is rate-limited per address, and an address that already has an account
is refused before a code is made. No account is created - the case never sends
the code back.

Outside the checkpoint the case checks the request was accepted and the token
decodes to a payload naming that address. Signing up is not an operation that
moved to v2, so the routing headers are recorded and not asserted.

## Evidence

Run 36125707623: on `c7b760ecf5` and `ea3d6264aa` (the fix's parent) the
payload carried `{"code":"8224"}` and `{"code":"4233"}`; on `develop`
(`37830698a4`) it carries only `email`, `exp` and `iat`.
