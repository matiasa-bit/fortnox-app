import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { getTokenFromDb, saveToken, supabaseServer } from "@/lib/supabase";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getToken(cookieStore, userId) {
  const tokenFromCookie = cookieStore.get("fortnox_access_token")?.value;
  if (tokenFromCookie) return tokenFromCookie;

  const tokenFromDb = await getTokenFromDb(userId);
  if (tokenFromDb) return tokenFromDb;

  try {
    return readFileSync(".fortnox_token", "utf8").trim();
  } catch {
    return null;
  }
}

async function getRefreshToken(cookieStore, userId) {
  const refreshFromCookie = cookieStore.get("fortnox_refresh_token")?.value;
  if (refreshFromCookie) return refreshFromCookie;

  try {
    const { data } = await supabaseServer
      .from("tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .single();

    if (data?.refresh_token) return data.refresh_token;
  } catch {
  }

  try {
    return readFileSync(".fortnox_refresh", "utf8").trim();
  } catch {
    return null;
  }
}

async function refreshToken(cookieStore, userId) {
  try {
    const refreshTokenValue = await getRefreshToken(cookieStore, userId);
    if (!refreshTokenValue) return null;

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
        refresh_token: refreshTokenValue,
      }),
    });

    const data = await response.json();
    if (data?.access_token) {
      await saveToken(userId, data.access_token, data.refresh_token || refreshTokenValue);
      return data.access_token;
    }
  } catch (error) {
    console.error("Refresh misslyckades vid CRM-sync:", error);
  }

  return null;
}

async function fetchJsonWithRetry(url, options = {}, retries = 4) {
  let attempt = 0;

  while (attempt < retries) {
    attempt += 1;
    const res = await fetch(url, options);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10) * 1000;
      await delay(retryAfter + 500);
      continue;
    }

    const text = await res.text();
    try {
      const data = text ? JSON.parse(text) : null;
      return { ok: res.ok, status: res.status, data };
    } catch {
      if (!res.ok) {
        await delay(1000 * attempt);
        continue;
      }
      return { ok: true, status: res.status, data: null };
    }
  }

  throw new Error(`Misslyckades att hämta JSON från ${url}`);
}

function normalizeOrgNumber(raw) {
  return String(raw || "").replace(/\s+/g, "").trim();
}

function normalizeStatus(row = {}) {
  const activeRaw = row?.Active ?? row?.active;
  const inactiveRaw = row?.Inactive ?? row?.inactive;

  if (inactiveRaw === true || activeRaw === false) return "former";
  return "active";
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("user_id")?.value || "default_user";
    let token = await getToken(cookieStore, userId);

    if (!token) {
      return Response.json({ ok: false, error: "Ingen Fortnox-token. Klicka 'Återaktivera Fortnox'." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const maxPages = Math.max(1, Math.min(100, Number(body?.maxPages || 10)));

    let page = 1;
    let hasMore = true;
    const allRows = [];

    while (hasMore && page <= maxPages) {
      const url = `https://api.fortnox.se/3/customers?limit=500&page=${page}`;
      let result = await fetchJsonWithRetry(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }, 4);

      if (!result?.ok && (result?.status === 401 || result?.status === 403)) {
        const newToken = await refreshToken(cookieStore, userId);
        if (!newToken) {
          return Response.json({ ok: false, error: "Ogiltig token vid hämtning av Fortnox-kunder. Logga in igen." }, { status: 401 });
        }

        token = newToken;
        result = await fetchJsonWithRetry(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }, 4);
      }

      if (!result?.ok) {
        return Response.json({ ok: false, error: `Fortnox-svar ${result?.status || "okänt"} vid hämtning av kunder.` }, { status: 502 });
      }

      if (result?.data?.ErrorInformation) {
        const newToken = await refreshToken(cookieStore, userId);
        if (!newToken) {
          return Response.json({ ok: false, error: result.data.ErrorInformation?.Message || "Tokenfel vid CRM-kundsync" }, { status: 401 });
        }

        token = newToken;
        result = await fetchJsonWithRetry(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }, 4);
      }

      const rows = result?.data?.Customers || [];
      allRows.push(...rows);
      hasMore = rows.length === 500;
      page += 1;
      await delay(120);
    }

    const organizationNumbers = Array.from(new Set(
      allRows
        .map(row => normalizeOrgNumber(row?.OrganisationNumber || row?.OrganizationNumber || row?.OrgNo))
        .filter(Boolean)
    ));

    const existingMap = new Map();
    if (organizationNumbers.length > 0) {
      const { data: existingRows } = await supabaseServer
        .from("crm_clients")
        .select("id, organization_number, responsible_consultant, client_status, notes")
        .in("organization_number", organizationNumbers);

      for (const row of existingRows || []) {
        existingMap.set(String(row.organization_number), row);
      }
    }

    const toUpsert = [];
    const skipped = [];

    for (const row of allRows) {
      const orgNumber = normalizeOrgNumber(row?.OrganisationNumber || row?.OrganizationNumber || row?.OrgNo);
      const companyName = String(row?.Name || row?.CustomerName || "").trim();

      if (!orgNumber || !companyName) {
        skipped.push({
          customer_number: String(row?.CustomerNumber || "").trim() || null,
          company_name: companyName || null,
          reason: !orgNumber ? "saknar organisationsnummer" : "saknar företagsnamn",
        });
        continue;
      }

      const existing = existingMap.get(orgNumber);
      toUpsert.push({
        company_name: companyName,
        organization_number: orgNumber,
        client_status: existing?.client_status || normalizeStatus(row),
        responsible_consultant: existing?.responsible_consultant || null,
        notes: existing?.notes || null,
      });
    }

    if (toUpsert.length > 0) {
      const { error } = await supabaseServer
        .from("crm_clients")
        .upsert(toUpsert, { onConflict: "organization_number" });

      if (error) {
        return Response.json({ ok: false, error: error.message || "Kunde inte spara CRM-kunder." }, { status: 500 });
      }

      try {
        const sharedCustomers = toUpsert.map(row => ({
          customer_number: row.organization_number,
          name: row.company_name,
        }));

        await supabaseServer
          .from("customers")
          .upsert(sharedCustomers, { onConflict: "customer_number" });
      } catch {
      }
    }

    return Response.json({
      ok: true,
      fetched: allRows.length,
      upserted: toUpsert.length,
      skipped: skipped.length,
      skippedRows: skipped.slice(0, 20),
      pagesFetched: Math.max(0, page - 1),
    });
  } catch (error) {
    console.error("CRM-kundsync misslyckades:", error);
    return Response.json({ ok: false, error: error?.message || "Okänt fel vid CRM-kundsync" }, { status: 500 });
  }
}
