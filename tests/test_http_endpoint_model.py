"""The smoke runner's pure parts: dotted-path lookup, and what it puts on the
record. Nothing here talks to a target.

`record_fields` exists because an entitlement surface changes under you. A run
that recorded only the flags it asserted can prove a named flag moved, but says
nothing about a flag nobody thought to name — and that is exactly the change
worth noticing.
"""

from __future__ import annotations

from framework.runners.http_endpoint import (
    MISSING,
    HttpEndpointConfig,
    HttpEndpointRunner,
    Observation,
    dig,
)

USAGE = {
    "level": "business",
    "limit": {"appEnable": True, "maxRows": -1},
    "seats": 3,
}


def _evidence(config: HttpEndpointConfig, body: dict | None) -> dict:  # type: ignore[type-arg]
    observation = Observation(status=200, body=body) if body is not None else None
    return HttpEndpointRunner().evidence(config, None, observation)


def test_dig_walks_into_nested_objects() -> None:
    assert dig(USAGE, "limit.appEnable") is True
    assert dig(USAGE, "level") == "business"


def test_dig_reports_a_missing_path_instead_of_raising() -> None:
    assert dig(USAGE, "limit.notAFlag") is MISSING
    assert dig(USAGE, "level.deeper") is MISSING


def test_a_recorded_subtree_lands_in_the_artifact_whole() -> None:
    config = HttpEndpointConfig(path="/api/instance/usage", record_fields=["limit"])
    recorded = _evidence(config, USAGE)["recorded"]
    # The whole object, not just the keys someone remembered to assert.
    assert recorded["limit"] == {"appEnable": True, "maxRows": -1}


def test_a_missing_recorded_path_is_stated_not_dropped() -> None:
    # Silence would read as "this field was absent from the response" and as
    # "nobody asked for it" at the same time. Say which.
    config = HttpEndpointConfig(path="/x", record_fields=["limit.gone"])
    assert _evidence(config, USAGE)["recorded"] == {"limit.gone": "<missing>"}


def test_recording_nothing_is_the_default() -> None:
    assert _evidence(HttpEndpointConfig(path="/x"), USAGE)["recorded"] == {}


def test_evidence_survives_a_case_that_never_observed_anything() -> None:
    # seed or execute blew up; the artifact still has to be written.
    config = HttpEndpointConfig(path="/x", record_fields=["limit"])
    evidence = _evidence(config, None)
    assert evidence["status"] is None
    assert evidence["recorded"] == {"limit": "<missing>"}
