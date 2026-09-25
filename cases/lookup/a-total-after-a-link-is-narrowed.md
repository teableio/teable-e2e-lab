# lookup/a-total-after-a-link-is-narrowed

**T7575** — fixed. On the `link-narrowed-rollup-refresh` runner.

## What the user sees

Orders linked to customers, one customer per order, and each customer totals
the amounts of its orders. After an order moves away from a customer, the
orders table and the customer's own list of orders are right, but the
customer's total still counts the order that left.

The case reaches that state the way the fix describes it: the link is widened
to many-to-many, one order is linked to both customers, and the link is
narrowed back to one customer per order, which keeps the first and drops the
other. Both tables are mid-change while that happens, and the recalculation
skipped tables in that state.

## What the checkpoint asserts

After narrowing, the order that moved is on customer A, A totals only that
order, and B totals only the order that stayed. When B still includes the
dropped order, the failure says so.

## Why the fixture is shaped this way

The two amounts differ (30 and 70), so a total that kept the dropped order
(100) cannot pass for the right one. Outside the checkpoint the case checks the
totals while the order is on both customers - A 30, B 100 - so the starting
point is known before narrowing, and that the conversions and reads are served
by v2.

## Evidence

Run 36123253484: on `a7e90ebdb2` (the fix's parent) the moved order was on A,
and B totalled 100 instead of 70; absent on `1be9ae9f9f` and `develop`
(`37830698a4`).
