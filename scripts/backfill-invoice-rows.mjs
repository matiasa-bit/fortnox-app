import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const env = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function parseAmount(value) {
  if (value == null) return 0;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

async function refreshToken(clientId, clientSecret) {
  try {
    const refreshPath = resolve(".fortnox_refresh");
    const refreshToken = readFileSync(refreshPath, "utf8").trim();
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

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
    if (!response.ok || !data?.access_token) {
      return null;
    }

    writeFileSync(resolve(".fortnox_token"), data.access_token);
    if (data.refresh_token) {
      writeFileSync(refreshPath, data.refresh_token);
    }
    return data.access_token;
  } catch {
    return null;
  }
}

function mapRows(invoiceNumber, rows = []) {
  return rows
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

async function fetchInvoice(invoiceNumber, token) {
  const res = await fetch(`https://api.fortnox.se/3/invoices/${invoiceNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 429) {
    const retryAfter = Number.parseInt(res.headers.get("Retry-After") || "2", 10) * 1000;
    return { rateLimited: true, retryAfter };
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403 || data?.ErrorInformation) {
    return { authError: true, status: res.status, data };
  }
  if (!res.ok) {
    return { error: true, status: res.status, data };
  }
  return { data };
}

async function main() {
  const envFromFile = parseEnvFile(resolve(".env.local"));
  const env = { ...envFromFile, ...process.env };

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = env.FORTNOX_CLIENT_ID;
  const clientSecret = env.FORTNOX_CLIENT_SECRET;
  const fromDate = getArg("from", "2025-01-01");
  const delayMs = Number.parseInt(getArg("delayMs", "250"), 10) || 250;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Saknar NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!clientId || !clientSecret) {
    throw new Error("Saknar FORTNOX_CLIENT_ID eller FORTNOX_CLIENT_SECRET");
  }

  let token = readFileSync(resolve(".fortnox_token"), "utf8").trim();
  if (!token) {
    throw new Error("Ingen .fortnox_token hittades");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("[1/4] Hämtar fakturor från Supabase...");
  const { data: invoices, error: invoiceError } = await supabase
    .from("invoices")
    .select("document_number")
    .gte("invoice_date", fromDate)
    .order("invoice_date", { ascending: false });

  if (invoiceError) {
    throw new Error(`Kunde inte läsa fakturor: ${invoiceError.message}`);
  }

  const invoiceNumbers = (invoices || [])
    .map(inv => String(inv.document_number || "").trim())
    .filter(Boolean);

  console.log(`[2/4] Rensar invoice_rows (${invoiceNumbers.length} fakturor att synka)...`);
  const { error: deleteError } = await supabase.from("invoice_rows").delete().not("invoice_number", "is", null);
  if (deleteError) {
    throw new Error(`Kunde inte rensa invoice_rows: ${deleteError.message}`);
  }

  console.log("[3/4] Hämtar rader från Fortnox och sparar...");
  let syncedInvoices = 0;
  let savedRows = 0;
  const failed = [];

  for (let idx = 0; idx < invoiceNumbers.length; idx += 1) {
    const invoiceNumber = invoiceNumbers[idx];

    try {
      let result = await fetchInvoice(invoiceNumber, token);

      if (result.rateLimited) {
        await delay(result.retryAfter + 500);
        result = await fetchInvoice(invoiceNumber, token);
      }

      if (result.authError) {
        const refreshed = await refreshToken(clientId, clientSecret);
        if (refreshed) {
          token = refreshed;
          result = await fetchInvoice(invoiceNumber, token);
        }
      }

      if (result.error || result.authError || !result.data) {
        failed.push(invoiceNumber);
        continue;
      }

      const rows = result.data?.Invoice?.InvoiceRows || [];
      const mapped = mapRows(invoiceNumber, rows);

      if (mapped.length > 0) {
        const { error: upsertError } = await supabase.from("invoice_rows").upsert(mapped, { onConflict: "id" });
        if (upsertError) {
          failed.push(invoiceNumber);
          continue;
        }
        savedRows += mapped.length;
      }

      syncedInvoices += 1;

      if ((idx + 1) % 25 === 0 || idx === invoiceNumbers.length - 1) {
        console.log(`  Progress: ${idx + 1}/${invoiceNumbers.length} fakturor, sparade rader: ${savedRows}, fel: ${failed.length}`);
      }

      await delay(delayMs);
    } catch {
      failed.push(invoiceNumber);
    }
  }

  console.log("[4/4] Klart");
  console.log(JSON.stringify({
    ok: true,
    fromDate,
    totalInvoices: invoiceNumbers.length,
    syncedInvoices,
    savedRows,
    failed: failed.length,
    failedSample: failed.slice(0, 10),
  }, null, 2));
}

main().catch(err => {
  console.error("Backfill misslyckades:", err?.message || err);
  process.exitCode = 1;
});
