import { createRequire } from "node:module";
import { Connection } from "sharedb/lib/client";
import type WebSocketType from "ws";

// `ws` is loaded when a case actually opens a socket, not when this module is
// read. Older teable-ee commits do not carry it, and a top-level import made
// the whole lab spec fail to load there - every case in the run, not only the
// ones that watch a page. Reaching further back is worth one lazy require.
const loadWebSocket = (): typeof WebSocketType => {
  const require_ = createRequire(import.meta.url);
  try {
    return require_("ws") as typeof WebSocketType;
  } catch (error) {
    throw new Error(
      "this case watches a page over a socket, and `ws` is not available on this commit: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
};

/**
 * A subscribed client, for bugs whose only symptom reaches the user over the
 * socket.
 *
 * Some failures never appear in an HTTP response. The request answers 200, and
 * what breaks is what the server then pushes to everyone watching that table:
 * a malformed op the client cannot apply, an update that never arrives, a
 * field that stays stuck in a failed state on the compute panel. Those are the
 * "Socket Error" reports, and until this existed the lab could not ask about
 * them at all - the observation surface simply was not there.
 *
 * This is the mirror image of `fixture-db.ts`. That one builds state the API
 * cannot express and is refused inside a checkpoint, because a case that both
 * writes and reads the database proves something about SQL rather than about
 * the product. This one is pure observation - it is what a real client sees -
 * so it belongs INSIDE the checkpoint, and nothing here writes anything.
 *
 * The connection is a plain WebSocket carrying the session cookie, not a
 * handle borrowed off the running application. That is deliberate: the whole
 * point is to see what a browser sees, and reaching into the server's own
 * ShareDb service to subscribe would quietly skip the wire - which, for this
 * class of bug, is precisely where the damage happens. The op that broke
 * T6608 was well-formed in memory and instruction-less once serialized.
 */

export interface RealtimeSubscription<T = Record<string, unknown>> {
  /** The document's current data, as this client has applied it. */
  data(): T | undefined;
  /**
   * Everything the client failed on: connection errors, doc errors, and ops it
   * could not apply. A healthy subscription keeps this empty.
   */
  errors(): string[];
  /** Resolves once `predicate` holds, or rejects when `timeoutMs` elapses. */
  waitFor(
    predicate: (data: T | undefined) => boolean,
    options: { timeoutMs: number; describe: string },
  ): Promise<void>;
  close(): void;
}

/**
 * A live query rather than a single document: the grid subscribes this way,
 * and the thing it watches is which rows are in the result and in what order.
 */
export interface RealtimeQuerySubscription {
  /** The ids currently in the result, in the order the server put them. */
  ids(): string[];
  /** Everything the client failed on. A healthy subscription keeps this empty. */
  errors(): string[];
  /** Resolves once `predicate` holds over the ids, or rejects on timeout. */
  waitFor(
    predicate: (ids: string[]) => boolean,
    options: { timeoutMs: number; describe: string },
  ): Promise<void>;
  close(): void;
}

export interface RealtimeClient {
  /** Subscribe to one document and start recording what arrives. */
  subscribe<T = Record<string, unknown>>(
    collection: string,
    documentId: string,
    options?: { timeoutMs?: number },
  ): Promise<RealtimeSubscription<T>>;
  /**
   * Subscribe to a query and start recording the result set. This is what the
   * grid does: it asks for a view's rows and is pushed a new answer whenever
   * the server decides the answer changed. A case that watches a doc instead
   * would miss exactly the failures where nothing is pushed at all.
   */
  subscribeQuery(
    collection: string,
    query: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<RealtimeQuerySubscription>;
  close(): void;
}

const DEFAULT_SUBSCRIBE_TIMEOUT_MS = 10_000;

const asMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Open a client connection to the running app's socket endpoint.
 *
 * `appUrl` is the http origin the harness booted on; the socket lives at
 * `/socket` on the same origin. The cookie is the seed user's session - without
 * it the server refuses the upgrade, and a case would be watching a channel
 * nobody is allowed to read.
 */
export const realtimeClient = (
  appUrl: string,
  cookie: string | undefined,
): RealtimeClient => {
  if (!cookie) {
    throw new Error(
      "no session cookie: a socket subscription would be rejected before it could observe anything",
    );
  }

  // The gateway serves SockJS, and only its browser-shaped transport keeps the
  // original upgrade request - which is where the session cookie lives. The
  // raw endpoint (`/socket/websocket`) connects but arrives as
  // `protocol: websocket-raw`, the gateway cannot recover the request, and it
  // falls back to headers without cookies: the subscription is then refused as
  // unauthorized. So this speaks the same path a browser does,
  // `/socket/<server>/<session>/websocket`, and frames messages the SockJS way.
  //
  // Framing it by hand rather than using sockjs-client is not stubbornness:
  // that client is written for browsers and offers no way to set a cookie
  // header, which is the one thing this connection cannot do without.
  const serverId = String(Math.floor(Math.random() * 900) + 100);
  const sessionId = Math.random().toString(36).slice(2, 10);
  const socketUrl = `${appUrl.replace(/^http/, "ws")}/socket/${serverId}/${sessionId}/websocket`;
  const WebSocketImpl = loadWebSocket();
  const socket = new WebSocketImpl(socketUrl, { headers: { cookie } });
  const connectionErrors: string[] = [];

  // Socket-level listeners, not just ShareDb-level ones. A refused upgrade or
  // a server that closes the connection is otherwise indistinguishable from a
  // channel that simply had nothing to say, and both surface as a timeout that
  // names the wrong problem.
  socket.on("error", (error: unknown) => {
    connectionErrors.push(`socket error: ${asMessage(error)}`);
  });
  socket.on("unexpected-response", (_request: unknown, response: unknown) => {
    const status = (response as { statusCode?: number })?.statusCode;
    connectionErrors.push(
      `socket upgrade refused with status ${status ?? "(unknown)"}`,
    );
  });

  // The shape ShareDb's client drives: it assigns the on* handlers and calls
  // send/close, so the SockJS frames are unwrapped here and never reach it.
  const adapter: {
    readyState: number;
    send(data: string): void;
    close(): void;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: (event: { code?: number; reason?: string }) => void;
    onerror?: (event: unknown) => void;
  } = {
    readyState: 0,
    send(data: string) {
      // A client frame is a JSON array of message strings.
      socket.send(JSON.stringify([data]));
    },
    close() {
      socket.close();
    },
  };

  socket.on("message", (raw: unknown) => {
    const frame = String(raw);
    const kind = frame[0];
    if (kind === "o") {
      // Open frame: the session is live, and only now may ShareDb talk.
      adapter.readyState = 1;
      adapter.onopen?.();
      return;
    }
    if (kind === "h") {
      // Heartbeat, carries nothing.
      return;
    }
    if (kind === "a") {
      const messages = JSON.parse(frame.slice(1)) as string[];
      for (const message of messages) {
        adapter.onmessage?.({ data: message });
      }
      return;
    }
    if (kind === "c") {
      const [code, reason] = JSON.parse(frame.slice(1)) as [number, string];
      connectionErrors.push(`socket closed by server: ${code} ${reason}`);
      adapter.readyState = 3;
      adapter.onclose?.({ code, reason });
    }
  });
  socket.on("close", (code: number, reason: unknown) => {
    if (adapter.readyState !== 3) {
      connectionErrors.push(
        `socket closed with code ${code}${reason ? ` (${String(reason)})` : ""}`,
      );
    }
    adapter.readyState = 3;
    adapter.onclose?.({ code });
  });

  const connection = new Connection(adapter as never);
  connection.on("error", (error: unknown) => {
    connectionErrors.push(asMessage(error));
  });

  return {
    async subscribe(collection, documentId, options) {
      const timeoutMs = options?.timeoutMs ?? DEFAULT_SUBSCRIBE_TIMEOUT_MS;
      const doc = connection.get(collection, documentId);
      const docErrors: string[] = [];
      doc.on("error", (error: unknown) => {
        docErrors.push(asMessage(error));
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `subscribing to ${collection}/${documentId} timed out after ${timeoutMs}ms` +
                (connectionErrors.length > 0
                  ? `; the socket reported ${JSON.stringify(connectionErrors)}`
                  : " with no socket-level error, so the server accepted the connection and said nothing"),
            ),
          );
        }, timeoutMs);
        doc.subscribe((error?: unknown) => {
          clearTimeout(timer);
          if (error) {
            reject(new Error(asMessage(error)));
            return;
          }
          resolve();
        });
      });

      const errors = () => [...connectionErrors, ...docErrors];

      return {
        data: () => doc.data as never,
        errors,
        async waitFor(predicate, waitOptions) {
          const deadline = Date.now() + waitOptions.timeoutMs;
          for (;;) {
            // An op the client could not apply is reported here rather than
            // waited out: the document will never reach the expected state, so
            // failing now says why instead of blaming the timeout.
            const failures = errors();
            if (failures.length > 0) {
              throw new Error(
                `the subscribed client errored while waiting for ${waitOptions.describe}: ${JSON.stringify(failures)}`,
              );
            }
            if (predicate(doc.data as never)) {
              return;
            }
            if (Date.now() >= deadline) {
              throw new Error(
                `the subscribed client never saw ${waitOptions.describe} within ${waitOptions.timeoutMs}ms; the document reads ${JSON.stringify(doc.data)}`,
              );
            }
            await new Promise((sleep) => setTimeout(sleep, 50));
          }
        },
        close() {
          try {
            doc.destroy();
          } catch {
            // Tearing down a subscription is housekeeping, not a result.
          }
        },
      };
    },
    async subscribeQuery(collection, query, options) {
      const timeoutMs = options?.timeoutMs ?? DEFAULT_SUBSCRIBE_TIMEOUT_MS;
      const queryErrors: string[] = [];
      const subscription = connection.createSubscribeQuery(
        collection,
        query,
      ) as {
        results?: { id: string }[];
        on(event: string, handler: (payload?: unknown) => void): void;
        destroy(): void;
      };
      subscription.on("error", (error?: unknown) => {
        queryErrors.push(asMessage(error));
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `subscribing to a query on ${collection} timed out after ${timeoutMs}ms` +
                (connectionErrors.length > 0
                  ? `; the socket reported ${JSON.stringify(connectionErrors)}`
                  : " with no socket-level error, so the server accepted the connection and said nothing"),
            ),
          );
        }, timeoutMs);
        subscription.on("ready", () => {
          clearTimeout(timer);
          resolve();
        });
        subscription.on("error", (error?: unknown) => {
          clearTimeout(timer);
          reject(new Error(asMessage(error)));
        });
      });

      const ids = () => (subscription.results ?? []).map((doc) => doc.id);
      const errors = () => [...connectionErrors, ...queryErrors];

      return {
        ids,
        errors,
        async waitFor(predicate, waitOptions) {
          const deadline = Date.now() + waitOptions.timeoutMs;
          for (;;) {
            const failures = errors();
            if (failures.length > 0) {
              throw new Error(
                `the subscribed query errored while waiting for ${waitOptions.describe}: ${JSON.stringify(failures)}`,
              );
            }
            if (predicate(ids())) {
              return;
            }
            if (Date.now() >= deadline) {
              throw new Error(
                `the subscribed query never saw ${waitOptions.describe} within ${waitOptions.timeoutMs}ms; ` +
                  `it holds ${JSON.stringify(ids())}`,
              );
            }
            await new Promise((sleep) => setTimeout(sleep, 50));
          }
        },
        close() {
          try {
            subscription.destroy();
          } catch {
            // Tearing down a subscription is housekeeping, not a result.
          }
        },
      };
    },
    close() {
      try {
        connection.close();
      } catch {
        // Same: closing is housekeeping.
      }
      try {
        socket.close();
      } catch {
        // Same.
      }
    },
  };
};
