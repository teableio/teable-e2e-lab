# base-share/a-shared-forms-picture

**T6604** — fixed. On the `shared-form-cover-url` runner.

## What the user sees

A shared form with a broken picture. The same form inside the product looks
right, so nothing is wrong with the picture or the form — only with what the
share link hands out.

The person seeing it is usually outside the company, filling the form in, and has
nothing to compare against.

## Why

Where a form's picture lives is stored as a short path. The address a browser can
fetch is worked out from that path when the form is read.

The shared form is read through two layers, and both worked it out — the second
over the first's answer. What came back was one address with another stuck on the
front of it. Inside the product the same view is read through one layer, which is
why it looks right there.

## What the checkpoint asserts

That the address was built **once**: the cover and the logo each carry exactly one
`http(s)://`, and each ends at the stored path.

Counting addresses rather than comparing against an expected string is
deliberate. What the storage prefix is depends on how the instance is deployed,
and pinning it would make this case about configuration instead of about the
doubling. Ending at the stored path is what says the address still points at the
right thing.

What is counted is the **scheme**, not `http://`. Joining one address onto
another leaves the inner one with a single slash — measured on the fix's parent,
the value is

```
http://127.0.0.1:PORT/api/attachments/read/public/http:/127.0.0.1:PORT/api/attachments/read/public/form/…
```

— so looking for the double slash finds one address in a string that plainly
holds two. The first version of this case did exactly that and passed on both
sides.

Both the cover and the logo are set and both are read, because the fix covers
both and either could regress alone.

## Why the fixture is shaped this way

The stored value must be a **short path**, and the runner refuses an address: an
address is exactly what the fix passes through untouched, so a fixture holding one
would be green on both sides.

Before the checkpoint, the form is read from **inside** the product and its
picture must carry the stored path. That is the control — it says the form and the
stored value are fine, so a doubled address afterwards is about the share path and
not about the fixture.
