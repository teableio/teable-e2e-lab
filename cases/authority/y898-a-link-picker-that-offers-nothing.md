# authority/y898-a-link-picker-that-offers-nothing

**T6548** — fixed.

## What the user sees

Two people open the same link column. One of them gets an empty picker: they
type a customer's name, the request answers 200, and nothing comes back. The
same customer's name is visible in cells that already link to it, which makes it
read as a broken search rather than a permission.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## Why a link column is its own permission

Whoever may work in a table and use one of its link columns may pick from the
records that column points at. That is what makes link columns usable at all:
the people filling in orders do not have to be given the customer table.

The picker began applying the target table's row scope as well, so a role that
narrows which customers somebody may read also emptied their picker — for a
column whose whole job is to reach past that.

## How the case is built

The authority matrix on a base of its own; a customers table with two rows, an
orders table with a link column pointing at it, and a role that lets the
restricted person work in orders while narrowing customers to one of the two.

Before the checkpoint that person searches the picker for the customer inside
their narrowing and must find it. A picker that answers nothing at all is broken
in a different way, and the checkpoint could not tell the two apart.

## What the checkpoint asserts

Searching the same picker for the customer outside their narrowing offers it.
The request is the one the picker makes — the share-field route, with the
link-candidate filter naming the column and the row being filled in.

## Limits

One narrowing, by row filter, on the target table. The same route also carries
column-level masking, which is not exercised here.
