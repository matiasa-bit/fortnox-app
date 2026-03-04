import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { getCachedInvoices, getInvoiceRowsForInvoices, saveInvoiceRows, supabaseServer } from "@/lib/supabase";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseAmount(value) {
  if (value == null) return 0;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
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

async function fetchInvoiceRows(invoiceNumber, token) {
  const res = await fetch(`https://api.fortnox.se/3/invoices/${invoiceNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10) * 1000;
    return { rateLimited: true, retryAfter };
  }

  const data = await res.json();
  return { data };
}

function mapRows(invoiceNumber, rows = []) {
  return rows
    .map(row => {
      const articleNumber = String(row.ArticleNumber || row.ArticleNo || row.ArticleId || "").trim();
      const articleName = String(row.ArticleName || row.Description || row.Text || "").trim();
      const quantity = row.Quantity ?? row.Qty ?? row.DeliveredQuantity ?? null;
      const unitPrice = row.UnitPrice ?? row.Price ?? row.PriceExcludingVAT ?? row.PriceExcludingVATSEK ?? null;
      const rawTotal = row.Total ?? row.TotalAmount ?? row.RowTotal ?? row.Sum ?? row.TotalExcludingVAT ?? null;
      const total =
        rawTotal != null && String(rawTotal).trim() !== ""
          ? rawTotal
          : parseAmount(quantity) * parseAmount(unitPrice);

      const hasAnyContent =
        !!articleNumber ||
        !!articleName ||
        parseAmount(quantity) !== 0 ||
        parseAmount(unitPrice) !== 0 ||
        parseAmount(total) !== 0;

      if (!hasAnyContent) return null;

      return {
      invoice_number: String(invoiceNumber),
      article_number: articleNumber || null,
      article_name: articleName || null,
      description: String(row.Description || row.Text || "").trim() || null,
      quantity,
      unit_price: unitPrice,
      total,
    };
    })
    .filter(Boolean);
}

export async function POST(request) {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("fortnox_auth")?.value;
  let token = getToken();

  if (!isLoggedIn || !token) {
    return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.max(1, Math.min(50, Number(body?.batchSize || 15)));
  const requestedInvoiceNumbers = Array.isArray(body?.invoiceNumbers)
    ? body.invoiceNumbers.map(num => String(num || "").trim()).filter(Boolean)
    : [];
  const fromDate = String(body?.fromDate || "2025-01-01").slice(0, 10);

  let invoiceNumbers = requestedInvoiceNumbers;

  if (invoiceNumbers.length === 0) {
    const invoices = await getCachedInvoices(fromDate);
    invoiceNumbers = invoices
      .map(inv => String(inv.document_number || inv.DocumentNumber || "").trim())
      .filter(Boolean);
  }

  invoiceNumbers = Array.from(new Set(invoiceNumbers));

  const existingRows = await getInvoiceRowsForInvoices(invoiceNumbers);
  const invoicesWithRows = new Set(existingRows.map(r => String(r.invoice_number || "").trim()).filter(Boolean));
  const missingInvoiceNumbers = invoiceNumbers.filter(num => !invoicesWithRows.has(num));

  const isFilteredScope = requestedInvoiceNumbers.length > 0;
  const syncCandidates = isFilteredScope ? invoiceNumbers : missingInvoiceNumbers;
  const toSync = syncCandidates.slice(0, batchSize);
  if (toSync.length === 0) {
    return Response.json({
      ok: true,
      message: isFilteredScope
        ? "Inga fakturor i aktuellt filter att synka"
        : "Alla fakturor har redan artikelrader i databasen",
      scope: isFilteredScope ? "filtered" : "all",
      totalInvoices: invoiceNumbers.length,
      missing: 0,
      syncedNow: 0,
    });
  }

  let syncedNow = 0;
  const failedNumbers = [];

  for (const invoiceNumber of toSync) {
    try {
      let result = await fetchInvoiceRows(invoiceNumber, token);
      if (result.rateLimited) {
        await delay(result.retryAfter + 400);
        result = await fetchInvoiceRows(invoiceNumber, token);
      }

      if (result?.data?.ErrorInformation) {
        const newToken = await refreshToken();
        if (newToken) {
          token = newToken;
          result = await fetchInvoiceRows(invoiceNumber, token);
        }
      }

      const rows = result?.data?.Invoice?.InvoiceRows || [];
      const mapped = mapRows(invoiceNumber, rows);
      await supabaseServer.from("invoice_rows").delete().eq("invoice_number", String(invoiceNumber));
      if (mapped.length > 0) {
        const saveResult = await saveInvoiceRows(mapped);
        if (saveResult?.error) {
          const err = saveResult.error;
          const msg = String(err?.message || "");
          const missingArticleNumber =
            err?.code === "PGRST204" &&
            msg.includes("article_number") &&
            msg.includes("invoice_rows");

          if (missingArticleNumber) {
            return Response.json({
              ok: false,
              error: "Databasschema saknar kolumnen invoice_rows.article_number. Kör setup.sql (eller en ALTER TABLE-migrering) i Supabase och prova igen.",
              code: err.code,
            }, { status: 500 });
          }

          throw new Error(err?.message || "Kunde inte spara invoice_rows");
        }
      }
      syncedNow += 1;
      await delay(250);
    } catch (err) {
      console.error(`Kunde inte synka artiklar för faktura ${invoiceNumber}:`, err);
      failedNumbers.push(invoiceNumber);
    }
  }

  return Response.json({
    ok: true,
    scope: isFilteredScope ? "filtered" : "all",
    syncedNow,
    failed: failedNumbers.length,
    failedNumbers: failedNumbers.slice(0, 10),
    totalInvoices: invoiceNumbers.length,
    missingBefore: missingInvoiceNumbers.length,
    remaining: Math.max(0, syncCandidates.length - syncedNow),
  });
}
