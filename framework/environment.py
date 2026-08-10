"""Bringing a target up and getting authenticated against it.

The target is a disposable Docker stack, so there is no pre-existing account to
borrow: the environment layer signs one up on first contact and caches the
session. Authentication is cookie-based rather than a personal access token,
for one reason — a PAT has to enumerate scopes, and a scope list is a second
thing to keep in sync with the product. The signed-in session already carries
exactly the authority the acceptance run is meant to exercise.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from framework.catalog import project_root

COMPOSE_FILE = "docker/compose.yaml"
SESSION_FILE = ".lab/session.json"

# The account every local run signs up as. Fixed on purpose: a run is
# reproducible, and the stack it talks to is thrown away afterwards.
LAB_EMAIL = "lab@teable-api-lab.test"
LAB_PASSWORD = "TeableApiLab!2026"


@dataclass(frozen=True)
class Session:
    endpoint: str
    cookie: str
    email: str

    def to_json(self) -> str:
        return json.dumps({"endpoint": self.endpoint, "cookie": self.cookie, "email": self.email})


def default_endpoint() -> str:
    explicit = os.environ.get("LAB_ENDPOINT")
    if explicit:
        return explicit
    return f"http://127.0.0.1:{os.environ.get('LAB_PORT', '3100')}"


def _compose(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", "compose", "-f", COMPOSE_FILE, *args],
        cwd=project_root(),
        text=True,
        capture_output=True,
        check=check,
    )


def compose_up(*, timeout_s: int = 300) -> None:
    """Start the stack and block until the health gate passes.

    `--wait` makes compose itself honour the healthchecks, so by the time this
    returns the API is answering — no sleep-and-hope in the CLI.
    """
    _compose("up", "-d", "--wait", "--wait-timeout", str(timeout_s))


def compose_down() -> None:
    """Stop the stack and drop its state. `-v` is the point, not a flourish."""
    _compose("down", "-v", check=False)


def compose_logs(tail: int = 100) -> str:
    return _compose("logs", "--tail", str(tail), check=False).stdout


def wait_for_health(endpoint: str, *, timeout_s: float = 120.0) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            response = httpx.get(f"{endpoint.rstrip('/')}/health", timeout=5.0)
            if response.status_code == 200:
                return True
        except httpx.HTTPError:
            pass
        time.sleep(2.0)
    return False


def _cookie_from(response: httpx.Response) -> str | None:
    jar = response.cookies
    parts = [f"{name}={value}" for name, value in jar.items()]
    return "; ".join(parts) if parts else None


def sign_in_or_up(
    endpoint: str, *, email: str = LAB_EMAIL, password: str = LAB_PASSWORD
) -> Session:
    """Sign in; sign up first if the account does not exist yet.

    Sign-in is attempted first so a re-run against a still-running stack does
    not depend on signup being idempotent.
    """
    base = endpoint.rstrip("/")
    credentials = {"email": email, "password": password}

    with httpx.Client(base_url=base, timeout=30.0, follow_redirects=True) as http:
        response = http.post("/api/auth/signin", json=credentials)
        if response.status_code >= 400:
            signup = http.post("/api/auth/signup", json=credentials)
            if signup.status_code >= 400:
                raise RuntimeError(
                    "could not authenticate against the target.\n"
                    f"  signin  -> HTTP {response.status_code} {response.text[:300]}\n"
                    f"  signup  -> HTTP {signup.status_code} {signup.text[:300]}"
                )
            response = signup

        cookie = _cookie_from(response)
        if not cookie:
            raise RuntimeError(
                f"authentication returned HTTP {response.status_code} but set no cookie; "
                "the client has nothing to authenticate with"
            )

    return Session(endpoint=base, cookie=cookie, email=email)


def session_path() -> Path:
    return project_root() / SESSION_FILE


def save_session(session: Session) -> Path:
    path = session_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(session.to_json(), encoding="utf-8")
    # Contains a live session cookie.
    path.chmod(0o600)
    return path


def load_session() -> Session | None:
    path = session_path()
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return Session(endpoint=data["endpoint"], cookie=data["cookie"], email=data["email"])
