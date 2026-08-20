// Ported from teable-perf-lab's framework/perf-error.ts, where every lesson in
// these comments was paid for: five cases failed eleven times over two days
// and CI printed only "Request failed with status code 500", because the axios
// error was flattened to its message before anything could read
// `response.data`. In a bug lab the server's own error body is even more often
// the evidence itself, so this file is load-bearing, not plumbing.

export type NormalizedBugError = {
  name?: string;
  message: string;
  stack?: string;
  /** HTTP status, when the failure came back from the server. */
  status?: number;
  /** The server's own error body, truncated. See `MAX_RESPONSE_CHARS`. */
  response?: string;
};

// Enough for a Nest error envelope with a stack, and bounded because this is
// written into every artifact. The point is to name the exception, not to
// carry the whole response.
export const MAX_RESPONSE_CHARS = 2000;

const asText = (data: unknown): string | undefined => {
  if (data == null || data === "") {
    return undefined;
  }
  if (typeof data === "string") {
    return data;
  }
  try {
    return JSON.stringify(data);
  } catch {
    // Circular, or something that will not serialize. Its shape is still worth
    // recording; its contents are not recoverable here.
    return String(data);
  }
};

// How far down a `cause` chain to look. A runner's BugPresentError wrapping an
// axios error is the shape that exists today; a few more links cost nothing.
// Bounded rather than unbounded so a self-referential cause cannot spin.
const MAX_CAUSE_DEPTH = 5;

/**
 * What the server said, when the failure is an HTTP response.
 *
 * Only `response.status` and `response.data` are read. `config` and `request`
 * are deliberately left alone: they carry the whole request body, which on a
 * 100-record bulk update is the payload this harness exists to send.
 *
 * The chain is walked because the error that reaches an artifact is almost
 * never the one the server produced — the checkpoint wraps it first.
 */
const serverDetail = (
  error: unknown,
): Pick<NormalizedBugError, "status" | "response"> => {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth += 1) {
    const currentError = current as {
      status?: unknown;
      data?: unknown;
      response?: { status?: unknown; data?: unknown };
    };
    const response = currentError.response;
    if (response && typeof response === "object") {
      const status =
        typeof response.status === "number" ? response.status : undefined;
      const body = asText(response.data);
      if (status !== undefined || body !== undefined) {
        return {
          status,
          response:
            body === undefined
              ? undefined
              : body.length > MAX_RESPONSE_CHARS
                ? `${body.slice(0, MAX_RESPONSE_CHARS)}… (${body.length} chars)`
                : body,
        };
      }
    }
    // @teable/core's HttpError keeps status/data at the top level after the
    // OpenAPI interceptor unwraps Axios. Read only those two fields as a
    // fallback; a full Axios response above remains the richer source.
    if (typeof currentError.status === "number") {
      const body = asText(currentError.data);
      return {
        status: currentError.status,
        response:
          body === undefined
            ? undefined
            : body.length > MAX_RESPONSE_CHARS
              ? `${body.slice(0, MAX_RESPONSE_CHARS)}... (${body.length} chars)`
              : body,
      };
    }
    const next = (current as { cause?: unknown })?.cause;
    if (next === current) {
      break;
    }
    current = next;
  }
  return {};
};

export const normalizeBugError = (error: unknown): NormalizedBugError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...serverDetail(error),
    };
  }

  return { message: String(error), ...serverDetail(error) };
};

/** The server's message, folded into the client's, for the CI log. */
export const describeBugError = (normalized: NormalizedBugError): string =>
  normalized.response === undefined
    ? normalized.message
    : `${normalized.message} — server said: ${normalized.response}`;

// Axios errors retain request/response/config objects. Re-throwing one through
// Vitest can serialize the entire request body even though the artifact only
// needs its name, message, stack, and what the server answered. Return a plain
// Error after artifacts have been written so large fixture payloads do not
// flood local or CI logs.
export const toBugTestFailure = (error: unknown): Error => {
  const normalized = normalizeBugError(error);
  const failure = new Error(describeBugError(normalized));
  failure.name = normalized.name ?? "Error";
  if (normalized.stack) failure.stack = normalized.stack;
  return failure;
};
