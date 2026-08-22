# user-field/assignment-burst-arrives-coalesced

**T6663** — fixed. The only case on the `user-field-notify-burst` runner.

## The bug

The other three cases from this change are about notifications nobody should
have received. This one is about notifications that were all legitimate and
still wrong in aggregate.

Assigning six rows to the same person is one act of planning — filling in a
sprint board, pasting a column of owners. Before the fix it produced six
notifications and six emails, one per row, each correct on its own. The person
on the receiving end has to open all six to learn there was one decision.

The fix coalesces per actor and table: the first delivery goes out immediately,
so nothing feels laggy, and everything raised while that window is open is
merged into a single follow-up.

## Why a ceiling, not an exact count

The expected steady state is **two** — one immediate, one merged — and the
runner asserts _at most three_. Where a burst lands relative to the window is
timing, and a case that demanded exactly two would go red for a burst that
happened to straddle a boundary, which is not a behavior anyone should be
paged about.

The ceiling has to sit strictly between the coalesced result and the burst
size, so the runner refuses a fixture where it does not: at or above
`burstSize` it passes even when nothing is coalesced, and below 2 it fails on
the fixed behavior. Six and three leave a gap that a single stray delivery
cannot close.

## Two things that would make this case lie

**Counting too early.** The merged notification only exists once the window
elapses. A case that counted immediately after the burst would see the fix's
first instant delivery, call it one, and pass on a commit that coalesces
nothing. `settleAfterBurstMs` is set well past the window for that reason.

**Counting zero.** A burst that notified nobody at all — assignments that never
landed, notifications switched off, a broken pipeline — would satisfy "at most
three" perfectly. So zero is rejected _inside_ the checkpoint, where it reads
as the product failing rather than as a clean pass. This is the one case on
these three runners with no separate control step; the burst is its own
control, because a working burst must produce something.

## One request per row

Not one batch of six. A batch is a single act of assignment and has always
produced a single notification, so batching would assert the behavior that was
never broken.
