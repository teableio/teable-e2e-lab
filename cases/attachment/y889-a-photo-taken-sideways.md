# attachment/y889-a-photo-taken-sideways

**T5712** — fixed.

## What the user sees

A photo taken with the phone held sideways is uploaded and comes out wrong:
stretched, cropped down the middle, or sideways in the thumbnail. The photo
itself is fine — it opens upright everywhere else.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## Why the size is the thing to ask about

Cameras do not rotate pixels. A phone held sideways writes the picture the way
the sensor read it and adds a note saying "this is rotated a quarter turn".
Every viewer honours that note, which is why the photo looks upright — but the
stored width and height belong to the unrotated pixels, so they are the wrong
way round compared with what anybody sees.

Those numbers are what everything downstream reserves space from. Recording
them as they came is what makes the cell, the gallery tile and the cropped
thumbnail all wrong at once, and it is a single number pair to ask for.

## How the case is built

A fixed 64×16 JPEG carrying a quarter-turn note, written byte for byte into the
runner so every run uploads the same photo, then uploaded the way the product
uploads anything: ask for a signature, put the bytes, and tell it they arrived.
The answer to that last step carries the size.

Before the checkpoint the case confirms the bytes are a JPEG and really carry an
EXIF block. Without the note the stored size is the displayed size, and the case
would be asserting nothing.

Asking for somewhere to put the bytes and putting them there is fixture too, so
it happens outside the checkpoint. A first attempt did it inside and reported a
rejected signature request — "The baseId is required when type is Table" — as
the bug reproducing, on both columns (run 34568213403).

## What the checkpoint asserts

The size that comes back is 16 wide by 64 high — the displayed size. A build
that ignores the note answers with exactly the numbers it was given, which is
the fault.

## Limits

One orientation (a quarter turn clockwise) and the upload path only. The
thumbnails cropped from it are what a person actually sees; they are produced
from these numbers, and are not read back here.
