from framework.case import define_case
from framework.runners.http_endpoint import HttpEndpointConfig, HttpEndpointRunner

# The capability set the rest of the suite is written against, and the single
# place where "what we are allowed to test" is written down.
#
# Every value below was read off a licensed target rather than inferred, and
# that habit is worth keeping: the licence in effect is a business licence, but
# its payload names the plan `pro` — the product it was sold as, not the level
# the instance reports. Only the instance can answer what `level` is.
#
# A target without the licence answers `free` with the four flags off, so this
# case is also the suite's "is the licence actually in effect" check. It failing
# first, by name, beats a dozen feature cases failing for reasons nobody traces
# back to entitlement.
case = define_case(
    id="smoke/instance-capabilities",
    title="被测实例的授权档位与能力开关符合本套用例的假设",
    runner=HttpEndpointRunner,
    owner="qa",
    tags=["smoke", "licensing", "guardrail"],
    timeout_s=30,
    config=HttpEndpointConfig(
        path="/api/instance/usage",
        expect_status=200,
        expect_fields={
            "level": "business",
            # Entitlement-gated, and on only because a licence is in effect.
            # A licence that expired or was never supplied turns these red here
            # rather than letting coverage quietly shrink.
            "limit.advancedPermissionsEnable": True,
            "limit.appEnable": True,
            "limit.automationEnable": True,
            "limit.fieldAIEnable": True,
            # The one capability this licence does not grant, asserted off so
            # the boundary is stated rather than remembered. A case covering
            # organisations would be exercising a feature that is not enabled;
            # if this ever turns on, that is a coverage decision to make on
            # purpose, and it arrives here as a red case.
            "limit.organizationEnable": False,
            # Not gated: the core surface this suite actually covers must stay
            # unlimited, or row-count-heavy cases would fail for the wrong reason.
            "limit.maxRows": -1,
            "limit.apiRateLimit": -1,
        },
        # The flags above are the ones cases depend on today. Recording the whole
        # limit object means the next entitlement change is visible in the
        # artifact even for a flag nobody has thought to assert yet.
        record_fields=["level", "limit"],
    ),
)
