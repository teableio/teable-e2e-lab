"""The check that stands between a public repository and a leaked key.

Both directions matter: it has to catch a pasted credential, and it has to stay
quiet on ordinary code — a scanner people start ignoring protects nothing.
"""

from __future__ import annotations

from framework.secret_scan import scan_files, scan_line, scan_text


def test_a_pasted_literal_is_caught() -> None:
    assert scan_line("      LICENSE_KEY: eyJhbGciOi-real-looking-key") == "LICENSE_KEY"


def test_an_environment_placeholder_is_fine() -> None:
    assert scan_line("      LICENSE_KEY: ${LICENSE_KEY:-}") is None
    assert scan_line("      LICENSE_KEY: ${LICENSE_KEY}") is None


def test_a_github_actions_secret_is_fine() -> None:
    assert scan_line("      LICENSE_KEY: ${{ secrets.TEABLE_LICENSE_KEY }}") is None


def test_a_declared_throwaway_is_fine() -> None:
    assert scan_line("      POSTGRES_PASSWORD: teable") is None


def test_a_quoted_literal_is_still_caught() -> None:
    assert scan_line('      API_TOKEN: "sk-live-abcdef123456"') == "API_TOKEN"


def test_an_env_lookup_is_not_a_literal() -> None:
    assert scan_line('    token = os.environ.get("LAB_TOKEN")') is None


def test_the_scanner_does_not_flag_its_own_rule_table() -> None:
    assert scan_line('GHA_SECRET = re.compile(r"^\\$\\{\\{ secrets")') is None


def test_an_unrelated_name_is_ignored() -> None:
    assert scan_line("      record_count: 1000") is None


def test_documentation_placeholders_do_not_cry_wolf() -> None:
    # These appear in the README explaining how to pass a key. Flagging them
    # trains people to ignore the check.
    assert scan_line("LICENSE_KEY=... uv run lab up") is None
    assert scan_line("LICENSE_KEY=<your-key> uv run lab up") is None
    assert scan_line("      API_TOKEN: YOUR_TOKEN_HERE") is None


def test_a_placeholder_marker_does_not_excuse_a_real_key() -> None:
    # A real base64/hex key contains none of the marker substrings, so this
    # still has to be caught.
    assert scan_line("LICENSE_KEY: eyJhbGciOiJSUzI1NiJ9.abcdef0123456789") == "LICENSE_KEY"


def test_scan_files_only_looks_at_scannable_paths() -> None:
    findings = scan_files(
        {
            "docker/compose.yaml": "LICENSE_KEY: real-value-here-0123",
            "artifacts/run/x.result.json": "LICENSE_KEY: whatever-0123456",
            "some/binary.png": "LICENSE_KEY: whatever-0123456",
        }
    )
    # artifacts/ is a run output, and .png is not scanned.
    assert [f.path for f in findings] == ["docker/compose.yaml"]


def test_scan_files_is_what_the_hook_feeds_staged_content_to() -> None:
    # The hook passes staged blobs, not disk contents; this is the seam that
    # makes "stage a key, then edit the file" impossible to sneak through.
    assert scan_files({"docker/compose.yaml": "LICENSE_KEY: ${LICENSE_KEY:-}"}) == []
    assert len(scan_files({"docker/compose.yaml": "LICENSE_KEY: sk-live-abcdef012345"})) == 1


def test_findings_carry_the_line_number() -> None:
    text = "ok: 1\nLICENSE_KEY: real-value-here\n"
    findings = scan_text("docker/compose.yaml", text)
    assert len(findings) == 1
    assert findings[0].line_number == 2
    assert "docker/compose.yaml:2" in findings[0].render()
