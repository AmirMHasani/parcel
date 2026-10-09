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

type ParcelEnv = Cloudflare.Env & {
  SELF?: Fetcher;
  PARCEL_WORKER_SECRET?: string;
  PUBLIC_SITE_URL?: string;
  SEO_INDEXABLE?: string;
  POLICIES_APPROVED?: string;
  SITE_ACCESS_PASSWORD?: string;
  RUN_SECONDS?: string;
};

// Operator endpoints carry their own bearer authorization and must stay
// reachable by the scheduler even while the public site is password-gated.
const OPERATOR_PATHS = new Set(["/api/worker/tick", "/api/ops"]);

export default {
  async fetch(request: Request, env: ParcelEnv, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;

    if (env.SITE_ACCESS_PASSWORD && !OPERATOR_PATHS.has(path)) {
      if (!(await hasSiteAccess(request, env.SITE_ACCESS_PASSWORD))) {
        return new Response("This site is not public yet.", {
          status: 401,
          headers: {
            "WWW-Authenticate": 'Basic realm="Parcel preview", charset="UTF-8"',
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow",
          },
        });
      }
    }

    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    const marketing = ["/", "/pricing", "/csv-guide", "/support"].includes(path);
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

  // Keep ticking while there is work, for up to ~50 seconds, then let the next
  // minute's trigger continue. Job leases make overlapping runs safe.
  const seconds = Math.min(50, Math.max(1, Number(env.RUN_SECONDS) || 50));
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const result = await call("/api/worker/tick", "{}");
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

async function hasSiteAccess(request: Request, password: string) {
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
