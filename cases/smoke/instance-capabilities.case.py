from framework.case import define_case
from framework.runners.http_endpoint import HttpEndpointConfig, HttpEndpointRunner

# The capability set the rest of the suite is written against. At the default
# entitlement level the flags below are off, so a case claiming to cover them
# would be exercising a feature that is not even enabled.
#
# If the target's entitlement changes, update `level` and flip the flags the
# suite is then allowed to cover. This is the single place where "what we may
# test" is written down.
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
            "level": "free",
            # Entitlement-gated. Asserted as off so that a change in entitlement
            # turns this case red instead of silently widening coverage.
            "limit.advancedPermissionsEnable": False,
            "limit.appEnable": False,
            "limit.automationEnable": False,
            "limit.fieldAIEnable": False,
            # Not gated: the core surface this suite actually covers must stay
            # unlimited, or row-count-heavy cases would fail for the wrong reason.
            "limit.maxRows": -1,
            "limit.apiRateLimit": -1,
        },
    ),
)
