import { readFileSync } from "fs";
import { cookies } from "next/headers";
import { saveInvoiceRows, supabaseServer } from "@/lib/supabase";

function parseAmount(value) {
  if (value == null) return 0;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function mapRows(invoiceNumber, rows = []) {
  return (rows || [])
    .map(row => {
      const articleNumber = String(row.ArticleNumber || row.ArticleNo || row.ArticleId || row.Article || "").trim();
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

export async function GET(request, context) {
  const params = await context.params;
  const invoiceNumber = params.invoiceNumber;

  if (!invoiceNumber) {
    return Response.json({ error: "Fakturanummer krävs" }, { status: 400 });
  }

  try {
    // First check cache in Supabase
    const { data: cachedRows, error: cacheErr } = await supabaseServer
      .from('invoice_rows')
      .select('*')
      .eq('invoice_number', invoiceNumber);
    if (cacheErr) console.error("Fel vid cache‑sökning:", cacheErr);
    if (cachedRows && cachedRows.length > 0) {
      return Response.json({ rows: cachedRows });
    }

    const cookieStore = await cookies();
    let token = cookieStore.get("fortnox_access_token")?.value || null;
    if (!token) {
      try {
        token = readFileSync(".fortnox_token", "utf8").trim();
      } catch {
        token = null;
      }
    }
    if (!token) {
      return Response.json({ error: "Inte inloggad" }, { status: 401 });
    }

    // internal helper to refresh token locally
    async function refreshTokenLocal() {
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
        const d = await response.json();
        if (d.access_token) {
          return d.access_token;
        }
      } catch (e) {
        console.error("Misslyckades med lokal refresh:", e);
      }
      return null;
    }

    // function to perform Fortnox fetch with optional retry
    async function fetchInvoice(tkn) {
      const res = await fetch(`https://api.fortnox.se/3/invoices/${invoiceNumber}`, {
        headers: {
          Authorization: `Bearer ${tkn}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 429) {
        return { rateLimited: true };
      }
      if (res.status === 401 || res.status === 403) {
        return { unauthorized: true, status: res.status, data: d };
      }
      if (!res.ok) {
        const message = d?.ErrorInformation?.message || d?.message || `Fortnox-fel (${res.status})`;
        return { error: message, status: res.status, data: d };
      }
      return { data: d, status: res.status };
    }

    let attempt = await fetchInvoice(token);
    if (attempt.rateLimited) {
      return Response.json({ error: "Rate limited, försök senare" }, { status: 429 });
    }
    let data = attempt.data;

    if (attempt.unauthorized || (data && data.ErrorInformation)) {
      console.log("Token fel i invoice-route, försöker förnya...", data.ErrorInformation);
      const newToken = await refreshTokenLocal();
      if (newToken) {
        token = newToken;
        attempt = await fetchInvoice(token);
        if (attempt.rateLimited) {
          return Response.json({ error: "Rate limited, försök senare" }, { status: 429 });
        }
        data = attempt.data;
      }
    }

    if (attempt.unauthorized) {
      return Response.json({ error: "Fortnox-token ogiltig. Logga in igen." }, { status: 401 });
    }

    if (attempt.error) {
      return Response.json({ error: attempt.error }, { status: attempt.status || 500 });
    }

    const rows = data?.Invoice?.InvoiceRows || [];
    const invoiceRowsData = mapRows(invoiceNumber, rows);
    
    if (invoiceRowsData.length > 0) {
      await saveInvoiceRows(invoiceRowsData);
    }

    return Response.json({ rows: invoiceRowsData });
  } catch (err) {
    console.error("Fel vid hämtning av artiklar:", err);
    return Response.json({ error: "Fel vid hämtning" }, { status: 500 });
  }
}
