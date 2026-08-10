from framework.case import define_case
from framework.environment import LAB_EMAIL
from framework.runners.http_endpoint import HttpEndpointConfig, HttpEndpointRunner

case = define_case(
    id="smoke/auth-user",
    title="已认证会话能读回自己的用户信息",
    runner=HttpEndpointRunner,
    owner="qa",
    tags=["smoke", "auth"],
    timeout_s=30,
    config=HttpEndpointConfig(
        path="/api/auth/user/me",
        expect_status=200,
        expect_fields={"id": None, "email": LAB_EMAIL},
    ),
)
