# oauth/y309-device-code-login-completes

**Y309 / T6745** - fixed.

## The requirement

A CLI running in a remote shell, container or other environment where a
browser cannot return to a local callback port must still be able to sign in.
The device authorization grant provides that path: the CLI receives a short
code, a signed-in person approves it on another device, and the CLI polls for
tokens using outbound HTTP only.

## Why this is an API case

The browser approval page is a client of three public endpoints. This case
drives those endpoints directly, so it covers the same server-side login flow
without requiring a browser or a reachable callback port:

1. An anonymous client asks the built-in CLI application for a device code.
2. The signed-in seed user reads the application and scopes using a lower-case,
   separator-free form of the displayed code.
3. That user approves the request.
4. The anonymous client exchanges the device code for a token pair.
5. A fresh client uses only the bearer token to read the approving user's
   profile.

No test-case actual-result text is used. Every prerequisite and assertion is
implemented in code.

## Preconditions verified before the checkpoint

- The harness session reads the expected seed user's profile. This is the
  person who will approve the login.
- A fresh HTTP client with no cookie or bearer token receives `401` from that
  same profile endpoint. This proves the final authenticated read cannot pass
  through an inherited session.

## What the checkpoint asserts

- Device-code issuance answers `200` with an eight-letter grouped user code,
  positive expiry and polling interval, and the expected verification path.
- The approval lookup accepts the human-friendly code without case or separator
  fidelity and identifies the Teable CLI application with a non-empty scope
  list.
- Approval and token exchange succeed.
- The token response contains a bearer access token, refresh token, positive
  lifetimes and granted scopes.
- A client carrying only that bearer token reads the exact user who approved
  the request.

The runner never includes the user code, device code or issued tokens in an
artifact or assertion message. After the checkpoint it revokes the token
through the public API.

## Scope

This is one atomic happy-path case. It does not also test denial, expiration,
poll backoff, transient-network retries, terminal log scanning, or the existing
loopback login. Those are separate behaviors and combining them here would make
a failure ambiguous.
