// Cloudflare Worker entry point for Parcel.
//
// fetch():     serves the vinext (Next.js-compatible) app, adds security/SEO
//              headers, and optionally gates the whole site behind a password
//              while it is not yet public (SITE_ACCESS_PASSWORD).
// scheduled(): replaces the external Render runner. A Cron Trigger fires every
//              minute; each background tick is sent to this same Worker through
//              the SELF service binding so every tick is its own invocation with
//              its own CPU, memory and subrequest budget, exactly as the old
//              HTTP runner behaved.
import handler from "vinext/server/fetch-handler";
import { guidePaths } from "../lib/seo";

type ParcelEnv = Cloudflare.Env & {
  SELF?: Fetcher;
  PARCEL_WORKER_SECRET?: string;
  PUBLIC_SITE_URL?: string;
  SEO_INDEXABLE?: string;
  POLICIES_APPROVED?: string;
  SITE_ACCESS_PASSWORD?: string;
  RUN_SECONDS?: string;
  SCHEDULER_MAX_CALLS?: string;
};

// Operator endpoints carry their own bearer authorization and must stay
// reachable by the scheduler even while the public site is password-gated.
const OPERATOR_PATHS = new Set(["/api/worker/tick", "/api/ops"]);
// Customer actions that create background work worth starting right away.
const KICK_PATHS = new Set(["/api/jobs", "/api/jobs/action", "/api/checkout"]);

export default {
  async fetch(request: Request, env: ParcelEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Send www.<domain> to the canonical domain so there is one public address.
    const canonical = internalOrigin(env.PUBLIC_SITE_URL);
    if (url.hostname === "www." + new URL(canonical).hostname) {
      return Response.redirect(canonical + path + url.search, 301);
    }

    if (env.SITE_ACCESS_PASSWORD && !OPERATOR_PATHS.has(path)) {
      const gate = await previewGate(request, url, env.SITE_ACCESS_PASSWORD);
      if (gate) return gate;
    }

    const response = await handler.fetch(request, env, ctx);

    // Start background processing immediately after an export is created,
    // retried or sent to checkout, instead of waiting for the next minute's
    // Cron Trigger. Job leases make overlapping runs safe.
    if (request.method === "POST" && response.ok && KICK_PATHS.has(path)) {
      ctx.waitUntil(
        runBackgroundWork(env).catch((error) =>
          console.error(JSON.stringify({ kick_error: String(error?.message || error) })),
        ),
      );
    }

    const headers = new Headers(response.headers);
    const marketing = ["/", "/pricing", "/csv-guide", "/support", ...guidePaths].includes(path);
    const approvedPolicy =
      env.POLICIES_APPROVED === "1" && ["/privacy", "/terms", "/refunds"].includes(path);
    if (env.SEO_INDEXABLE !== "1" || env.SITE_ACCESS_PASSWORD || !(marketing || approvedPolicy)) {
      headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers.set("Strict-Transport-Security", "max-age=31536000");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },

  async scheduled(_controller: ScheduledController, env: ParcelEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      runBackgroundWork(env).catch((error) => {
        console.error(JSON.stringify({ scheduler_error: String(error?.message || error) }));
        throw error;
      }),
    );
  },
};

async function runBackgroundWork(env: ParcelEnv) {
  if (!env.SELF || !env.PARCEL_WORKER_SECRET) {
    console.error(JSON.stringify({ scheduler: "not_configured" }));
    throw new Error("Scheduler requires the SELF binding and PARCEL_WORKER_SECRET.");
  }
  const origin = internalOrigin(env.PUBLIC_SITE_URL);
  const headers = {
    Authorization: "Bearer " + env.PARCEL_WORKER_SECRET,
    "Content-Type": "application/json",
  };
  const call = async (path: string, body?: string) => {
    const response = await env.SELF!.fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body,
      redirect: "manual",
    });
    if (!(response.headers.get("content-type") || "").includes("application/json")) {
      throw new Error(`Expected JSON from ${path}, got HTTP ${response.status}`);
    }
    const json: any = await response.json();
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${json?.error || "error"}`);
    return json;
  };

  // Keep ticking while there is work, for up to ~50 seconds and a bounded
  // number of calls, then let the next minute's trigger continue. Cleanup runs
  // on the first call only. Job leases make overlapping runs safe.
  const seconds = Math.min(50, Math.max(1, Number(env.RUN_SECONDS) || 50));
  const maxCalls = Math.min(200, Math.max(1, Number(env.SCHEDULER_MAX_CALLS) || 40));
  const deadline = Date.now() + seconds * 1000;
  for (let calls = 0; calls < maxCalls && Date.now() < deadline; calls++) {
    const result = await call("/api/worker/tick", JSON.stringify({ clean: calls === 0 }));
    console.log(JSON.stringify({ worked: result.worked, type: result.type }));
    if (!result.worked) break;
  }

  // Surface operator alerts as a failed scheduled run (visible in the
  // Cloudflare dashboard and Workers logs), as the Render runner did.
  const ops = await call("/api/ops");
  const alerts = ops.alerts || {};
  if (Object.values(alerts).some(Boolean)) {
    console.error(JSON.stringify({ operator_attention: alerts }));
    throw new Error("Parcel needs operator attention: " + JSON.stringify(alerts));
  }
}

function internalOrigin(publicUrl?: string) {
  try {
    const url = new URL(publicUrl || "");
    if (url.protocol === "https:") return url.origin;
  } catch {}
  return "https://parcel.internal";
}

// Pre-launch gate: a plain password page that sets a cookie (works in every
// browser and in-app viewer). HTTP Basic credentials are also accepted so
// scripts and command-line checks can pass the gate.
const PREVIEW_COOKIE = "parcel_preview";
const PREVIEW_LOGIN = "/__preview-login";

async function previewGate(request: Request, url: URL, password: string): Promise<Response | null> {
  const expected = await digest("parcel-preview|" + password);
  const cookie = (request.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(PREVIEW_COOKIE + "="));
  if (cookie && cookie.slice(PREVIEW_COOKIE.length + 1) === expected) return null;
  if (await hasBasicAccess(request, password)) return null;

  if (url.pathname === PREVIEW_LOGIN && request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const supplied = String(form?.get("password") || "");
    const next = safeNext(String(form?.get("next") || "/"));
    if ((await digest(supplied)) === (await digest(password))) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: next,
          "Set-Cookie": `${PREVIEW_COOKIE}=${expected}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store",
        },
      });
    }
    return previewPage(next, true);
  }
  return previewPage(safeNext(url.pathname + url.search), false);
}

function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith(PREVIEW_LOGIN) ? value : "/";
}

function previewPage(next: string, wrong: boolean) {
  const escaped = next.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Parcel preview</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f5f0;color:#1d2a22}form{background:#fff;padding:32px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.12);width:min(360px,calc(100vw - 32px));box-sizing:border-box}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 20px;color:#55635a}label{display:block;font-weight:600;margin-bottom:6px}input{width:100%;box-sizing:border-box;font-size:16px;padding:10px 12px;border:1px solid #c9cfc9;border-radius:8px}button{margin-top:16px;width:100%;font-size:16px;padding:11px;border:0;border-radius:8px;background:#37694c;color:#fff;font-weight:600;cursor:pointer}.err{color:#a3261b;margin:12px 0 0}</style></head>
<body><form method="post" action="${PREVIEW_LOGIN}"><h1>parcel.</h1><p>This site is not public yet. Enter the preview password to continue.</p><label for="pw">Preview password</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus><input type="hidden" name="next" value="${escaped}">${wrong ? '<p class="err">That password is not right. Try again.</p>' : ""}<button type="submit">Continue</button></form></body></html>`;
  return new Response(html, {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

async function hasBasicAccess(request: Request, password: string) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const supplied = decoded.slice(decoded.indexOf(":") + 1);
  return (await digest(supplied)) === (await digest(password));
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
