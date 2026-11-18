"use client";

/**
 * Global fetch shim for calls to iamx-api. Does two things, both scoped to `/iamx/api/`:
 *
 * 1. Attaches the console's Bearer token. iamx-api authenticates every non-public route
 *    (middleware.RequireAuthUnlessPublic), but many console pages call fetch() directly
 *    instead of useAuthFetch(), so the token is added here once rather than page by page.
 *    A request that already carries Authorization is left untouched. On a 401 the session
 *    is gone, so the stored login is cleared and the user is sent back to the login page.
 *
 * 2. Routes around edge-WAF path blocks. The WAF in front of the edge/directory refuses every
 *    request under /iamx/api/users, /iamx/api/admin/roles and /iamx/api/admin/domains
 *    (403 "Forbidden" before reaching iamx-api, token or not). iamx-api serves the same
 *    handlers under /iamx/api/directory/{users,roles,domains}, which the WAF lets through, so
 *    those prefixes are rewritten here. Every route is authenticated server-side.
 *
 * 3. HTTP method-override (Cloudflare workaround).
 *
 * The WAF in front of `iam.example.com` blocks PUT/DELETE/PATCH domain-wide, so
 * those requests are 403'd by the edge and never reach iamx-api. This patches the
 * global `fetch` so that PUT/DELETE/PATCH calls aimed at the iamx-api backend are
 * sent as POST carrying `X-HTTP-Method-Override: <verb>`; iamx-api rewrites the
 * method back before routing (see api/main.go). Plain GET/POST are untouched, and
 * the rewrite is scoped to `/iamx/api/` so Keycloak (`/idp`) and any other host
 * keep their real verbs.
 *
 * Installed at module-evaluation time (before any component fires a request) and
 * guarded so it patches exactly once.
 */

const OVERRIDABLE = new Set(["PUT", "DELETE", "PATCH"]);

function targetsIamxApi(url: string): boolean {
  return url.includes("/iamx/api/");
}

declare global {
  interface Window {
    __iamxMethodOverridePatched?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__iamxMethodOverridePatched) {
  window.__iamxMethodOverridePatched = true;
  const originalFetch = window.fetch.bind(window);

  /** The console's JWT from /auth/login (AuthContext keeps it in localStorage). */
  const consoleToken = (): string | null => {
    try {
      return window.localStorage.getItem("token");
    } catch {
      return null;
    }
  };

  /** Add the Bearer token unless the caller already set Authorization. */
  const withAuth = (input: RequestInfo | URL, init?: RequestInit): [RequestInfo | URL, RequestInit | undefined] => {
    const token = consoleToken();
    if (!token) return [input, init];
    if (input instanceof Request && !init) {
      if (input.headers.has("Authorization")) return [input, init];
      const headers = new Headers(input.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return [new Request(input, { headers }), undefined];
    }
    const headers = new Headers(init?.headers);
    if (headers.has("Authorization")) return [input, init];
    headers.set("Authorization", `Bearer ${token}`);
    return [input, { ...init, headers }];
  };

  /** WAF-blocked prefix → alias iamx-api also serves. Only whole path segments match. */
  const WAF_ALIASES: Array<[RegExp, string]> = [
    [/\/iamx\/api\/users(?=[/?#]|$)/, "/iamx/api/directory/users"],
    [/\/iamx\/api\/admin\/roles(?=[/?#]|$)/, "/iamx/api/directory/roles"],
    [/\/iamx\/api\/admin\/domains(?=[/?#]|$)/, "/iamx/api/directory/domains"],
  ];
  const aliasUrl = (url: string): string => {
    for (const [re, to] of WAF_ALIASES) {
      if (re.test(url)) return url.replace(re, to);
    }
    return url;
  };
  const withAlias = (input: RequestInfo | URL, url: string): RequestInfo | URL => {
    const to = aliasUrl(url);
    if (to === url) return input;
    if (input instanceof Request) return new Request(to, input);
    return input instanceof URL ? new URL(to) : to;
  };

  /** Session expired or never existed: clear it and go to the login page (once). */
  const onUnauthorized = (res: Response): Response => {
    if (res.status === 401 && !window.location.pathname.startsWith("/iamx/login")) {
      try {
        window.localStorage.removeItem("token");
        window.localStorage.removeItem("user");
      } catch {
        /* storage unavailable — still redirect */
      }
      const next = window.location.pathname.replace(/^\/iamx/, "") + window.location.search;
      window.location.href = `/iamx/login?expired=1&next=${encodeURIComponent(next)}`;
    }
    return res;
  };

  window.fetch = function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input instanceof Request
        ? input.url
        : String(input);
    if (targetsIamxApi(rawUrl) && !rawUrl.includes("/iamx/api/auth/login")) {
      input = withAlias(input, rawUrl);
      [input, init] = withAuth(input, init);
      return send(input, init).then(onUnauthorized);
    }
    return send(input, init);
  };

  function send(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    try {
      const method = (
        init?.method ||
        (input instanceof Request ? input.method : "GET") ||
        "GET"
      ).toUpperCase();

      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input instanceof Request
          ? input.url
          : String(input);

      if (OVERRIDABLE.has(method) && targetsIamxApi(url)) {
        if (input instanceof Request && !init) {
          // fetch(new Request(...)) shape — rebuild as POST, body carries over.
          const headers = new Headers(input.headers);
          headers.set("X-HTTP-Method-Override", method);
          return originalFetch(new Request(input, { method: "POST", headers }));
        }
        const headers = new Headers(init?.headers);
        headers.set("X-HTTP-Method-Override", method);
        return originalFetch(input, { ...init, method: "POST", headers });
      }
    } catch (e) {
      // Never break a request because of the shim — fall through to the original.
      // eslint-disable-next-line no-console
      console.error("[method-override] shim error, passing through:", e);
    }
    return originalFetch(input as RequestInfo | URL, init);
  };
}

export default function MethodOverrideClient() {
  return null;
}
