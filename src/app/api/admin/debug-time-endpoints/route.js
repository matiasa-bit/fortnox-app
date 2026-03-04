import { readFileSync } from "fs";

function getToken() {
  try {
    return readFileSync(".fortnox_token", "utf8").trim();
  } catch {
    return null;
  }
}

function normalizeDate(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  return value.slice(0, 10);
}

async function refreshToken() {
  try {
    const refreshToken = readFileSync(".fortnox_refresh", "utf8").trim();
    const credentials = Buffer.from(
      `${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch("https://apps.fortnox.se/oauth-v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json().catch(() => null);
    if (data?.access_token) {      
      return data.access_token;
    }
  } catch {
    return null;
  }

  return null;
}

async function probeEndpoint(endpoint, token, fromDate, limit) {
  let activeToken = token;
  const isRegistrationsV2 = /^\/api\/time\/registrations-v2$/i.test(endpoint);
  const params = new URLSearchParams();

  if (isRegistrationsV2) {
    if (fromDate) params.set("fromDate", fromDate);
  } else {
    params.set("limit", String(limit));
    params.set("page", "1");
    if (fromDate) params.set("fromdate", fromDate);
  }

  const url = `https://api.fortnox.se${endpoint}${params.toString() ? `?${params.toString()}` : ""}`;

  async function callOnce(currentToken) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    return {
      status: res.status,
      ok: res.ok,
      data,
      raw: text || "",
    };
  }

  let result = await callOnce(activeToken);

  if (result.status === 401) {
    const nextToken = await refreshToken();
    if (nextToken) {
      activeToken = nextToken;
      result = await callOnce(activeToken);
    }
  }

  const errorCode = Number(result?.data?.ErrorInformation?.code || result?.data?.code || 0) || null;
  const errorMessage =
    String(result?.data?.ErrorInformation?.message || result?.data?.message || "").trim() || null;

  return {
    endpoint,
    status: result.status,
    ok: result.ok,
    errorCode,
    errorMessage,
    topLevelKeys: result?.data && typeof result.data === "object" ? Object.keys(result.data).slice(0, 10) : [],
    preview: result.raw.slice(0, 300),
    tokenRefreshed: activeToken !== token,
    token: activeToken,
  };
}

export async function POST(request) {
  let token = getToken();
  if (!token) {
    return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const fromDate = normalizeDate(body?.fromDate) || "2025-01-01";
  const limit = Math.max(1, Math.min(50, Number(body?.limit || 3)));
  const endpoints = Array.isArray(body?.endpoints) && body.endpoints.length
    ? body.endpoints
    : [
        "/api/time/registrations-v2",
        "/3/attendancetransactions",
        "/3/absencetransactions",
        "/3/timereportingrecords",
        "/3/timereports",
        "/3/timeregistrations",
      ];

  const results = [];
  for (const endpoint of endpoints) {
    const normalized = String(endpoint || "").trim();
    if (!normalized.startsWith("/")) continue;
    const probe = await probeEndpoint(normalized, token, fromDate, limit);
    token = probe.token || token;
    results.push({
      endpoint: probe.endpoint,
      status: probe.status,
      ok: probe.ok,
      errorCode: probe.errorCode,
      errorMessage: probe.errorMessage,
      topLevelKeys: probe.topLevelKeys,
      preview: probe.preview,
      tokenRefreshed: probe.tokenRefreshed,
    });
  }

  return Response.json({
    ok: true,
    fromDate,
    limit,
    scopesRequested: String(process.env.FORTNOX_EXTRA_SCOPES || "").split(/\s+/).filter(Boolean),
    results,
  });
}