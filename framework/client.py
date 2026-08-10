"""HTTP access to Teable, with every request recorded as evidence.

Two decisions worth knowing about:

1. Non-2xx is not an exception. Functional cases routinely assert that a call
   *is* rejected, so the client hands back the response and lets the runner
   decide. Only transport failures raise.
2. Every request is logged into the case artifact. When a case fails at 3am in
   CI, the request log is usually the whole diagnosis — which call, what status,
   how long, and what the server said.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

# Body keys whose values never enter an artifact. Headers need no equivalent:
# the request log below records no headers at all, which is stronger than
# redacting them. If you ever add headers to the log, add the redaction with it.
REDACTED_BODY_KEYS = frozenset({"password", "token", "secret", "accessToken", "refreshToken"})

# How much of an error response body to keep. Enough to read the message,
# little enough that a 10k-row error payload does not bloat the artifact.
ERROR_BODY_CHARS = 2000


def _redact_body(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: ("<redacted>" if k in REDACTED_BODY_KEYS else _redact_body(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        # Long payloads are summarised, not copied: a 1k-record create body is
        # not evidence, its shape is.
        if len(value) > 3:
            return [_redact_body(v) for v in value[:3]] + [f"<{len(value) - 3} more>"]
        return [_redact_body(v) for v in value]
    return value


class TeableClient:
    def __init__(
        self,
        endpoint: str,
        *,
        token: str | None = None,
        cookie: str | None = None,
        timeout_s: float = 60.0,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        headers: dict[str, str] = {"accept": "application/json"}
        if token:
            headers["authorization"] = f"Bearer {token}"
        if cookie:
            headers["cookie"] = cookie
        self._http = httpx.Client(
            base_url=self.endpoint,
            headers=headers,
            timeout=timeout_s,
            follow_redirects=True,
        )
        self._log: list[dict[str, Any]] = []

    # -- lifecycle -------------------------------------------------------

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> TeableClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -- requests --------------------------------------------------------

    def request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        started = time.perf_counter()
        response = self._http.request(
            method, path, json=json, params=params, headers=headers
        )
        duration_ms = round((time.perf_counter() - started) * 1000, 2)

        entry: dict[str, Any] = {
            "method": method.upper(),
            "path": path,
            "status": response.status_code,
            "duration_ms": duration_ms,
        }
        if params:
            entry["params"] = _redact_body(params)
        if json is not None:
            entry["request_body"] = _redact_body(json)
        if response.status_code >= 400:
            entry["response_body"] = response.text[:ERROR_BODY_CHARS]
        self._log.append(entry)
        return response

    def get(self, path: str, **kw: Any) -> httpx.Response:
        return self.request("GET", path, **kw)

    def post(self, path: str, **kw: Any) -> httpx.Response:
        return self.request("POST", path, **kw)

    def patch(self, path: str, **kw: Any) -> httpx.Response:
        return self.request("PATCH", path, **kw)

    def put(self, path: str, **kw: Any) -> httpx.Response:
        return self.request("PUT", path, **kw)

    def delete(self, path: str, **kw: Any) -> httpx.Response:
        return self.request("DELETE", path, **kw)

    # -- evidence --------------------------------------------------------

    @property
    def requests(self) -> list[dict[str, Any]]:
        return list(self._log)

    def reset_log(self) -> None:
        self._log.clear()
