# attachment/y892-where-an-upload-lands

**T6285** — fixed.

## What the user sees

Nothing. This is the shape where nothing looks wrong until somebody uses it:
before a file is uploaded the client asks for a place to put it, and the request
carried a field naming the file. That name was used as the address on disk, so a
name with `..` in it walks out of the area meant for uploads and the file lands
wherever the name says.

## What was measured

On the fix's parent `567ff0703` the address comes back as
`../escaped-<run id>` — the name the client sent, one directory above where
uploads belong. On `develop` it comes back as `table/<server token>`. Run 34572921498.

## What the case does, and what it deliberately does not

It asks for the address, carrying a name that climbs out of the upload
directory. It does **not** then upload anything: on the side where the name is
honoured, uploading would put a file where the name points, and a regression
test should not be the thing that does that. The address alone says which side
answered.

## What the checkpoint asserts

The address that comes back — path, token and url together — carries neither the
name the client sent nor any `..` segment, and there is an address at all. A
server that chose the address answers with its own token; a server that honoured
the name answers with the name.

## Why the name is unique per run

The name carries the run id, so an address that happens to contain a fixed
string for unrelated reasons cannot pass or fail this by accident.

## Limits

One upload type and the signature request only. The same commit also fixes
stored XSS in notifications and OAuth scope escalation, neither of which is
exercised here.
