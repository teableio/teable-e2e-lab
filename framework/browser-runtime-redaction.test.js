import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeBrowserDiagnosticText } from "./browser-runtime.ts";

test("browser diagnostics redact secret and URL boundary overlaps", () => {
  // Isolate synthetic fixtures from CI secrets without printing the environment.
  const environment = { ...process.env };
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    process.env.E2E_LAB_REDACTION_PASSWORD = "env/p4ss?private#fragment";
    const fixtures = [
      {
        name: "relative code, state and fragment",
        input: "GET /auth/reset?code=one-time-value&state=session-value#private 200",
        secrets: [],
        expected: "GET /auth/reset 200",
      },
      {
        name: "bare password containing slash, question mark and fragment",
        input: "p4ss/word?private#fragment",
        secrets: ["p4ss/word?private#fragment"],
        expected: "<REDACTED>",
      },
      {
        name: "known secret consumes the query delimiter",
        input: "GET /auth/reset?code=secret&state=session-value#private 200",
        secrets: ["reset?code=secret"],
        expected: "GET <REDACTED> 200",
      },
      {
        name: "known secret consumes the slash introducing a route",
        input: "p4ss/word?code=secret&state=session-value#private",
        secrets: ["p4ss/"],
        expected: "<REDACTED>",
      },
      {
        name: "known secret in relative query cannot leave later state or code",
        input: "GET /auth/reset?password=p4ss/word?private&state=S&code=C#F 200",
        secrets: ["p4ss/word?private"],
        expected: "GET <REDACTED> 200",
      },
      {
        name: "known secret in relative path cannot leave query suffixes",
        input: "GET /auth/reset/p4ss/word?private?state=S&code=C#F 200",
        secrets: ["p4ss/word?private"],
        expected: "GET <REDACTED> 200",
      },
      {
        name: "absolute credentials, query and fragment without a known secret",
        input: "https://user:abcd@example.com/path?email=alice@example.com#private",
        secrets: [],
        expected: "https://example.com/path",
      },
      {
        name: "known absolute credential redacts its whole overlapping URL",
        input: "https://user:abcd@example.com/path?email=alice@example.com#private",
        secrets: ["abcd"],
        expected: "<REDACTED>",
      },
      {
        name: "absolute and relative URLs are normalized once each",
        input: "https://user:pass@example.com/path?code=C /auth/reset?state=S#F",
        secrets: [],
        expected: "https://example.com/path /auth/reset",
      },
      {
        name: "protocol-relative credentials, query and fragment",
        input: "//user:pass@example.com/path?code=C#F",
        secrets: [],
        expected: "//example.com/path",
      },
      {
        name: "useful origin and path survive without secrets",
        input: "https://example.com/api/table GET /auth/login 200",
        secrets: [],
        expected: "https://example.com/api/table GET /auth/login 200",
      },
      {
        name: "overlapping secret matches merge transitively",
        input: "abcabcab",
        secrets: ["abca", "bcab"],
        expected: "<REDACTED>",
      },
      {
        name: "ANSI sequences cannot split a known secret",
        input: "pa\u001b[31mss/word?private\u001b[0m",
        secrets: ["pass/word?private"],
        expected: "<REDACTED>",
      },
      {
        name: "environment secret containing URL delimiters",
        input: "env/p4ss?private#fragment",
        secrets: [],
        expected: "<REDACTED>",
      },
      {
        name: "authorization header redaction remains active",
        input: "Authorization: Bearer synthetic-access-value",
        secrets: [],
        expected: "Authorization: <REDACTED>",
      },
      {
        name: "session credential redaction remains active",
        input: "auth_session=synthetic-session-value",
        secrets: [],
        expected: "auth_session=<REDACTED>",
      },
      {
        name: "JWT redaction remains active",
        input: "eyJhbGciOiJub25lIn0.eyJzdWIiOiJzeW50aGV0aWMifQ.signature",
        secrets: [],
        expected: "<REDACTED>",
      },
      {
        name: "URL normalization cannot introduce an unmasked known secret",
        input: "https://user:pass@example.com/path",
        secrets: ["https://example.com/path"],
        expected: "<REDACTED>",
      },
    ];
    for (const fixture of fixtures) {
      assert.equal(
        sanitizeBrowserDiagnosticText(fixture.input, fixture.secrets),
        fixture.expected,
        fixture.name,
      );
    }
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, environment);
  }
});
