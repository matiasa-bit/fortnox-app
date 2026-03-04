import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { saveArticleRegistry } from "@/lib/supabase";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getToken() {
  try {
    return readFileSync(".fortnox_token", "utf8").trim();
  } catch {
    return null;
  }
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

    const data = await response.json();
    if (data.access_token) {
      return data.access_token;
    }
  } catch (err) {
    console.error("Refresh misslyckades:", err);
  }
  return null;
}

function normalizeArticleNumber(raw) {
  if (!raw) return "";
  return String(raw).trim();
}

async function fetchJsonWithRetry(url, options = {}, retries = 4) {
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
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
        await delay(800 * attempt);
        continue;
      }
      return { ok: true, status: res.status, data: null };
    }
  }

  throw new Error(`Misslyckades att hämta artikelregister från ${url}`);
}

export async function POST(request) {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("fortnox_auth")?.value;
  let token = getToken();

  if (!isLoggedIn || !token) {
    return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const maxPages = Math.max(1, Math.min(200, Number(body?.maxPages || 20)));

  let page = 1;
  let hasMore = true;
  let fetched = 0;
  const rowsToSave = [];

  while (hasMore && page <= maxPages) {
    const url = `https://api.fortnox.se/3/articles?limit=500&page=${page}`;
    let result = await fetchJsonWithRetry(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }, 4);

    if (result?.data?.ErrorInformation) {
      const newToken = await refreshToken();
      if (!newToken) {
        return Response.json({ ok: false, error: result.data.ErrorInformation?.Message || "Tokenfel vid artikelsync" }, { status: 401 });
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

    const apiRows = result?.data?.Articles || [];
    fetched += apiRows.length;

    const mapped = apiRows
      .map(a => {
        const articleNumber = normalizeArticleNumber(a.ArticleNumber || a.Number || a.ArticleNo || a.ArticleId);
        if (!articleNumber) return null;
        return {
          article_number: articleNumber,
          article_name: String(a.Description || a.Name || a.ArticleName || "").trim(),
          description: String(a.Description || a.Name || "").trim(),
          unit: String(a.Unit || a.UnitCode || "").trim(),
          active: typeof a.Active === "boolean" ? a.Active : null,
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    rowsToSave.push(...mapped);

    hasMore = apiRows.length === 500;
    page++;
    await delay(120);
  }

  if (rowsToSave.length > 0) {
    await saveArticleRegistry(rowsToSave);
  }

  return Response.json({
    ok: true,
    fetched,
    saved: rowsToSave.length,
    pages: page - 1,
    hasMore,
  });
}
