"""Smoke runner: one authenticated GET, asserted on status and body fields.

No fixture, no cleanup. It exists to answer "is the target up and is my session
real" before anything expensive runs, and to give the framework its smallest
possible end-to-end case.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from framework.types import RunContext, Runner


class HttpEndpointConfig(BaseModel):
    path: str
    expect_status: int = 200
    # Response fields that must hold. Keys are dotted paths into the JSON body
    # (`limit.appEnable`), so a nested capability flag can be asserted without a
    # bespoke runner. `None` means "must exist, any value".
    expect_fields: dict[str, Any] = Field(default_factory=dict)
    # Body sub-trees copied into the artifact verbatim, as dotted paths. For
    # state worth having on the record even though nothing asserts it: a run
    # that recorded only what it asserted can say a flag it named has changed,
    # but not that a flag it never named appeared. Values pass through the same
    # scrub as the rest of the artifact.
    record_fields: list[str] = Field(default_factory=list)


MISSING = object()


def dig(body: dict[str, Any], dotted: str) -> Any:
    """Walk a dotted path, returning MISSING rather than raising."""
    current: Any = body
    for part in dotted.split("."):
        if not isinstance(current, dict) or part not in current:
            return MISSING
        current = current[part]
    return current


class Observation(BaseModel):
    status: int
    body: dict[str, Any] | None = None


class HttpEndpointRunner(Runner[HttpEndpointConfig, None, Observation]):
    kind = "http-endpoint"

    def seed(self, ctx: RunContext, config: HttpEndpointConfig) -> None:
        return None

    def execute(
        self, ctx: RunContext, config: HttpEndpointConfig, fixture: None
    ) -> Observation:
        response = ctx.client.get(config.path)
        body: dict[str, Any] | None
        try:
            parsed = response.json()
            body = parsed if isinstance(parsed, dict) else {"_root": parsed}
        except ValueError:
            body = None
        return Observation(status=response.status_code, body=body)

    def verify(
        self,
        ctx: RunContext,
        config: HttpEndpointConfig,
        fixture: None,
        observation: Observation,
    ) -> None:
        ctx.checks.equal("http.status", config.expect_status, observation.status)
        if observation.status != config.expect_status:
            return

        body = observation.body or {}
        for key, expected in config.expect_fields.items():
            actual = dig(body, key)
            if expected is None:
                ctx.checks.is_true(
                    f"body.{key}.present",
                    actual is not MISSING,
                    note="value not asserted, presence only",
                )
            else:
                ctx.checks.equal(
                    f"body.{key}", expected, "<missing>" if actual is MISSING else actual
                )

    def evidence(
        self,
        config: HttpEndpointConfig,
        fixture: None,
        observation: Observation | None,
    ) -> dict[str, Any]:
        recorded: dict[str, Any] = {}
        body = observation.body if observation else None
        for dotted in config.record_fields:
            value = dig(body, dotted) if body else MISSING
            recorded[dotted] = "<missing>" if value is MISSING else value

        return {
            "path": config.path,
            "status": observation.status if observation else None,
            "body_keys": sorted((observation.body or {}).keys()) if observation else [],
            "recorded": recorded,
        }
