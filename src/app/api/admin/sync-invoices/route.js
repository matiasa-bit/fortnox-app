import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { getTokenFromDb, saveInvoices, saveToken, supabaseServer } from "@/lib/supabase";

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
  } catch {}

  try {
    return readFileSync(".fortnox_refresh", "utf8").trim();
  } catch {
    return null;
  }
}

async function refreshAccessToken(cookieStore, userId) {
  try {
    const refresh = await getRefreshToken(cookieStore, userId);
    if (!refresh) return null;

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
        refresh_token: refresh,
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      await saveToken(userId, data.access_token, data.refresh_token || refresh);
      return data.access_token;
    }
  } catch (err) {
    console.error("Token refresh misslyckades:", err);
  }
  return null;
}

async function fetchInvoicePageFromFortnox(token, invoiceType, page, fromDate) {
  const params = new URLSearchParams({
    limit: "500",
    page: String(page),
    fromdate: fromDate,
    invoicetype: invoiceType,
  });

  let retries = 3;
  while (retries > 0) {
    const res = await fetch(`https://api.fortnox.se/3/invoices?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });

    if (res.status === 429) {
      const wait = parseInt(res.headers.get("Retry-After") || "2", 10) * 1000;
      await delay(wait + 500);
      retries--;
      continue;
    }

    const data = await res.json().catch(() => ({}));
    return { data, ok: res.ok, status: res.status };
  }
  return { data: {}, ok: false, status: 0 };
}

export async function POST(request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value || "default_user";
  let token = await getToken(cookieStore, userId);

  if (!token) {
    return Response.json({ ok: false, error: "Ingen Fortnox-token." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const fromDate = String(body?.fromDate || "2025-01-01").slice(0, 10);

  const allInvoices = [];
  const debugInfo = [];

  for (const invoiceType of ["INVOICE", "CREDIT"]) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      let { data, ok, status } = await fetchInvoicePageFromFortnox(token, invoiceType, page, fromDate);

      if (data?.ErrorInformation) {
        const newToken = await refreshAccessToken(cookieStore, userId);
        if (newToken) {
          token = newToken;
          const retry = await fetchInvoicePageFromFortnox(token, invoiceType, page, fromDate);
          data = retry.data;
          ok = retry.ok;
          status = retry.status;
        }
      }

      if (!ok || data?.ErrorInformation) {
        const errMsg = data?.ErrorInformation?.message || `HTTP ${status}`;
        console.warn(`Avbryter ${invoiceType} sida ${page}:`, errMsg);
        debugInfo.push({ invoiceType, page, error: errMsg });
        break;
      }

      const batch = Array.isArray(data?.Invoices) ? data.Invoices : [];
      if (page === 1) {
        debugInfo.push({ invoiceType, page1Keys: Object.keys(data || {}), batchLength: batch.length });
      }
      allInvoices.push(...batch);
      hasMore = batch.length === 500;
      page++;

      if (hasMore) await delay(200);
    }
  }

  // Dedup by document number
  const seen = new Set();
  const unique = allInvoices.filter(inv => {
    const num = String(inv?.DocumentNumber || "").trim();
    if (!num || seen.has(num)) return false;
    seen.add(num);
    return true;
  });

  const toSave = unique.map(inv => ({
    document_number: inv.DocumentNumber,
    customer_name: inv.CustomerName,
    customer_number: String(inv.CustomerNumber || inv.CustomerNo || ""),
    invoice_date: inv.InvoiceDate,
    total: inv.Total,
    balance: inv.Balance,
    currency_code: inv.CurrencyCode || null,
  }));

  if (toSave.length > 0) {
    await saveInvoices(toSave);
  }

  return Response.json({ ok: true, saved: toSave.length, fromDate, debug: debugInfo });
}
