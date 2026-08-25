import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

import type { BugRunContext } from "./types";

type BrowserResponse = {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  json(): Promise<unknown>;
  request(): { method(): string };
};

type BrowserRequest = {
  method(): string;
  url(): string;
};

type BrowserRoute = {
  request(): BrowserRequest;
  continue(): Promise<void>;
  abort(errorCode?: string): Promise<void>;
};

export type BrowserLocator = {
  count(): Promise<number>;
  click(options?: Record<string, unknown>): Promise<void>;
  dblclick(options?: Record<string, unknown>): Promise<void>;
  fill(value: string): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
  hover(): Promise<void>;
  inputValue(): Promise<string>;
  isDisabled(): Promise<boolean>;
  isVisible(): Promise<boolean>;
  textContent(): Promise<string | null>;
  boundingBox(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>;
  locator(selector: string): BrowserLocator;
  last(): BrowserLocator;
  nth(index: number): BrowserLocator;
};

export type BrowserPage = {
  goto(
    url: string,
    options?: { waitUntil?: string; timeout?: number },
  ): Promise<unknown>;
  locator(selector: string): BrowserLocator;
  on(event: "pageerror", handler: (error: Error) => void): void;
  on(event: "request", handler: (request: BrowserRequest) => void): void;
  url(): string;
  waitForResponse(
    predicate: (response: BrowserResponse) => boolean,
    options?: { timeout?: number },
  ): Promise<BrowserResponse>;
  route(
    pattern: string,
    handler: (route: BrowserRoute) => Promise<void>,
  ): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  keyboard: {
    press(key: string): Promise<void>;
  };
};

type BrowserContext = {
  addCookies(
    cookies: {
      name: string;
      value: string;
      url: string;
      httpOnly: boolean;
      sameSite: "Lax";
    }[],
  ): Promise<void>;
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
};

type Browser = {
  newContext(options: {
    viewport: { width: number; height: number };
  }): Promise<BrowserContext>;
  close(): Promise<void>;
};

type PlaywrightModule = {
  chromium: {
    launch(options: {
      headless: boolean;
      channel?: "chrome";
    }): Promise<Browser>;
  };
};

type RuntimeState = {
  root: string;
  frontendUrl: string;
  frontend: ChildProcess;
  browser: Browser;
  output: string[];
};

let runtime: RuntimeState | undefined;
let runtimePromise: Promise<RuntimeState> | undefined;

const findTeableRoot = () => {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), "../.."),
    resolve(process.cwd(), "../../.."),
  ];
  const requireFromHere = createRequire(import.meta.url);
  const fs = requireFromHere("node:fs") as {
    existsSync(path: string): boolean;
  };
  const root = candidates.find((candidate) =>
    fs.existsSync(join(candidate, "enterprise/app-ee/package.json")),
  );
  if (!root) {
    throw new Error(
      `Cannot locate the teable-ee root from ${process.cwd()} (expected enterprise/app-ee/package.json)`,
    );
  }
  return root;
};

const reservePort = async () => {
  const server = createServer();
  server.unref();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve a local port for the Next.js server");
  }
  const port = address.port;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  return port;
};

const waitForFrontend = async (
  frontendUrl: string,
  child: ChildProcess,
  output: string[],
) => {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(
        `Next.js exited with ${child.exitCode} before becoming ready:\n${output.slice(-40).join("")}`,
      );
    }
    try {
      const response = await fetch(`${frontendUrl}/auth/login`);
      if (response.status < 500) {
        return;
      }
    } catch {
      // The server is still compiling or has not bound the port yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(
    `Next.js did not become ready at ${frontendUrl}:\n${output.slice(-40).join("")}`,
  );
};

const loadPlaywright = (root: string): PlaywrightModule => {
  const requireFromApp = createRequire(
    join(root, "enterprise/app-ee/package.json"),
  );
  return requireFromApp("@playwright/test") as PlaywrightModule;
};

const startRuntime = async (context: BugRunContext): Promise<RuntimeState> => {
  const root = findTeableRoot();
  const backendPort = new URL(context.appUrl).port;
  const frontendPort = await reservePort();
  const frontendUrl = `http://127.0.0.1:${frontendPort}`;
  const output: string[] = [];
  const frontend = spawn(
    "corepack",
    [
      "pnpm",
      "-F",
      "@teable/app-ee",
      "exec",
      "next",
      "dev",
      "-p",
      String(frontendPort),
    ],
    {
      cwd: root,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(frontendPort),
        PUBLIC_ORIGIN: frontendUrl,
        SERVER_PORT: backendPort,
        SOCKET_PORT: backendPort,
        NEXT_BUILD_ENV_CSP: "false",
        NEXT_BUILD_ENV_SENTRY_ENABLED: "false",
        NEXT_BUILD_ENV_TYPECHECK: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const collect = (chunk: unknown) => {
    output.push(String(chunk));
    if (output.length > 200) output.shift();
  };
  frontend.stdout?.on("data", collect);
  frontend.stderr?.on("data", collect);

  try {
    await waitForFrontend(frontendUrl, frontend, output);
    const { chromium } = loadPlaywright(root);
    // GitHub's ubuntu-latest image already provides Chrome. Local runs use the
    // Playwright-managed Chromium revision installed by the localrun skill.
    const browser = await chromium.launch(
      process.env.CI
        ? { headless: true, channel: "chrome" }
        : { headless: true },
    );
    return { root, frontendUrl, frontend, browser, output };
  } catch (error) {
    stopChild(frontend);
    throw error;
  }
};

const stopChild = (child: ChildProcess) => {
  if (!child.pid || child.exitCode != null) return;
  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    child.kill("SIGTERM");
  }
};

const getRuntime = async (context: BugRunContext) => {
  if (runtime) return runtime;
  runtimePromise ??= startRuntime(context);
  runtime = await runtimePromise;
  return runtime;
};

const sessionCookie = (cookie: string | undefined) => {
  const part = cookie
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("auth_session="));
  if (!part) {
    throw new Error("The e2e session did not provide an auth_session cookie");
  }
  return {
    name: "auth_session",
    value: part.slice("auth_session=".length),
  };
};

export const openBrowserPage = async (
  context: BugRunContext,
  options: { locale?: "zh" } = {},
) => {
  const state = await getRuntime(context);
  const browserContext = await state.browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const cookie = sessionCookie(context.cookie);
  await browserContext.addCookies([
    {
      ...cookie,
      url: state.frontendUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
    ...(options.locale
      ? [
          {
            name: "NEXT_LOCALE",
            value: options.locale,
            url: state.frontendUrl,
            httpOnly: false,
            sameSite: "Lax" as const,
          },
        ]
      : []),
  ]);
  const page = await browserContext.newPage();
  return {
    page,
    frontendUrl: state.frontendUrl,
    close: () => browserContext.close(),
  };
};

export const closeBrowserRuntime = async () => {
  const state = runtime;
  runtime = undefined;
  runtimePromise = undefined;
  if (!state) return;
  await state.browser.close().catch(() => undefined);
  stopChild(state.frontend);
};
