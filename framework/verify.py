"""Verification helpers — the "never trust the 200" toolkit.

perf-lab's checklist puts it plainly: a successful status code proves the server
accepted the request, not that the state it promised exists. Every value-writing
case is expected to prove its final state through the same read path a user
would hit.

Two levels, same as perf-lab:

- **sample**: a few known rows, polled until they settle. Cheap, catches the
  common "it didn't land at all" failure fast.
- **full scan**: every row, paged through the public read endpoint. Proves the
  operation landed *completely* — the failure mode a sample cannot see is
  "997 of 1000 rows updated".
"""

from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from typing import Any, TypeVar

from framework.client import TeableClient

T = TypeVar("T")

# Teable's record endpoint caps take at 1000; paging above that silently
# truncates rather than erroring, which would turn a full scan into a lie.
MAX_PAGE_SIZE = 1000


class VerificationError(RuntimeError):
    """The verification itself could not run — distinct from a failed check."""


def scan_records(
    client: TeableClient,
    table_id: str,
    *,
    page_size: int = MAX_PAGE_SIZE,
    field_key_type: str = "name",
    view_id: str | None = None,
) -> Iterator[tuple[int, dict[str, Any]]]:
    """Page through every record, yielding (row_number, record) 1-based.

    Owns the skip/take loop so no case open-codes it: a hand-rolled loop that
    forgets its bounds guard turns an empty response into a silent pass.
    """
    if page_size > MAX_PAGE_SIZE:
        raise ValueError(f"page_size {page_size} exceeds the API maximum of {MAX_PAGE_SIZE}")

    skip = 0
    row_number = 0
    while True:
        params: dict[str, Any] = {
            "take": page_size,
            "skip": skip,
            "fieldKeyType": field_key_type,
        }
        if view_id:
            params["viewId"] = view_id
        response = client.get(f"/api/table/{table_id}/record", params=params)
        if response.status_code != 200:
            raise VerificationError(
                f"full scan of {table_id} failed at skip={skip}: "
                f"HTTP {response.status_code} {response.text[:300]}"
            )
        records = response.json().get("records", [])
        if not records:
            return
        for record in records:
            row_number += 1
            yield row_number, record
        if len(records) < page_size:
            return
        skip += page_size


def count_records(client: TeableClient, table_id: str, **kw: Any) -> int:
    """Row count via the same paged read path a full scan uses."""
    return sum(1 for _ in scan_records(client, table_id, **kw))


def poll_until(
    probe: Callable[[], T],
    *,
    ready: Callable[[T], bool],
    timeout_s: float = 30.0,
    interval_s: float = 0.5,
    description: str = "condition",
) -> T:
    """Retry `probe` until `ready` holds, or raise with the last observation.

    For anything asynchronous — computed fields, propagation, background jobs.
    Always prefer this over a bare sleep: a sleep either wastes time or flakes,
    and it never tells you what the state actually was when it gave up.
    """
    deadline = time.monotonic() + timeout_s
    last: T | None = None
    attempts = 0
    while True:
        last = probe()
        attempts += 1
        if ready(last):
            return last
        if time.monotonic() >= deadline:
            raise VerificationError(
                f"{description} not ready after {timeout_s}s ({attempts} attempts); "
                f"last observation: {last!r}"
            )
        time.sleep(interval_s)
