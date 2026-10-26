/**
 * Shared helper for Vercel Cron → Laravel process-on-demand workers.
 * Vercel injects Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set.
 */

function cronSecret() {
  return (process.env.CRON_SECRET || "").trim();
}

function apiOrigin() {
  return (process.env.API_ORIGIN || "http://127.0.0.1:8088").replace(/\/$/, "");
}

/**
 * @param {Request} request
 * @param {string} laravelPath e.g. /api/v1/cron/abandonment/process
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function invokeLaravelCron(request, laravelPath) {
  const expected = cronSecret();
  if (!expected) {
    return {
      status: 503,
      body: {
        ok: false,
        error: "CRON_SECRET is not configured on the web app (Vercel env).",
      },
    };
  }

  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const alt = (request.headers.get("x-cron-secret") || "").trim();
  const provided = bearer || alt;

  if (!provided || provided !== expected) {
    return {
      status: 401,
      body: { ok: false, error: "Unauthorized cron request." },
    };
  }

  const url = `${apiOrigin()}${laravelPath.startsWith("/") ? laravelPath : `/${laravelPath}`}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${expected}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    let body;
    try {
      body = await res.json();
    } catch {
      body = { ok: false, error: "Non-JSON response from Laravel cron endpoint." };
    }

    return { status: res.status, body };
  } catch (err) {
    return {
      status: 502,
      body: {
        ok: false,
        error: "Failed to reach Laravel cron endpoint.",
        detail: err instanceof Error ? err.message : String(err),
        api_origin: apiOrigin(),
      },
    };
  }
}
