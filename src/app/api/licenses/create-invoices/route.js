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
  } catch {}

  try {
    return readFileSync(".fortnox_refresh", "utf8").trim();
  } catch {
    return null;
  }
}

async function doRefreshToken(cookieStore, userId) {
  try {
    const refreshTok = await getRefreshToken(cookieStore, userId);
    if (!refreshTok) return null;

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
        refresh_token: refreshTok,
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      await saveToken(userId, data.access_token, data.refresh_token || refreshTok);
      return data.access_token;
    }
  } catch (err) {
    console.error("Token refresh misslyckades:", err);
  }
  return null;
}

async function fortnoxGet(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 429) {
    const wait = parseInt(res.headers.get("Retry-After") || "2", 10) * 1000;
    return { rateLimited: true, retryAfter: wait };
  }
  const data = await res.json().catch(() => ({}));
  return { data, status: res.status, ok: res.ok };
}

async function fortnoxPost(url, token, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    const wait = parseInt(res.headers.get("Retry-After") || "2", 10) * 1000;
    return { rateLimited: true, retryAfter: wait };
  }
  const data = await res.json().catch(() => ({}));
  return { data, status: res.status, ok: res.ok };
}

async function lookupCustomerNumber(orgNumber, token) {
  const url = `https://api.fortnox.se/3/customers?organizationnumber=${encodeURIComponent(orgNumber)}&limit=1`;
  const result = await fortnoxGet(url, token);
  if (result.rateLimited) return { rateLimited: true, retryAfter: result.retryAfter };

  const customers = result?.data?.Customers || [];
  if (customers.length === 0) return { notFound: true };

  return { customerNumber: String(customers[0].CustomerNumber || "") };
}

// Kontrollera om faktura redan finns via ExternalInvoiceReference1
async function findExistingInvoice(extRef1, customerNumber, token) {
  const url = `https://api.fortnox.se/3/invoices?externalinvoicereference1=${encodeURIComponent(extRef1)}&customernumber=${encodeURIComponent(customerNumber)}`;
  const result = await fortnoxGet(url, token);
  if (result.rateLimited) return { rateLimited: true, retryAfter: result.retryAfter };

  const invoices = (result?.data?.Invoices || []).filter(i => !i.Cancelled);
  if (invoices.length > 0) return { found: true, invoiceNumber: String(invoices[0].DocumentNumber || "") };
  return { found: false };
}

async function createFortnoxInvoice(customerNumber, rows, discountPercent, invoiceDate, token) {
  const yyyyMM = invoiceDate
    ? invoiceDate.slice(0, 7)
    : new Date().toISOString().slice(0, 7);
  const extRef1 = `Fortnoxlicenser ${yyyyMM} ${customerNumber}`;

  const invoiceRows = rows.map(row => {
    const r = {
      ArticleNumber: row.articleNumber || undefined,
      Description: row.description || undefined,
      DeliveredQuantity: Number(row.quantity) || 1,
      Price: Number(row.price) || 0,
    };
    if (discountPercent > 0) {
      r.Discount = discountPercent;
      r.DiscountType = "PERCENT";
    }
    return r;
  });

  const invoiceBody = {
    CustomerNumber: customerNumber,
    ExternalInvoiceReference1: extRef1,
    InvoiceRows: invoiceRows,
  };
  if (invoiceDate) invoiceBody.InvoiceDate = invoiceDate;

  const url = "https://api.fortnox.se/3/invoices";
  const body = { Invoice: invoiceBody };
  const result = await fortnoxPost(url, token, body);
  if (result.rateLimited) return { rateLimited: true, retryAfter: result.retryAfter };

  if (result?.data?.ErrorInformation) {
    return { error: String(result.data.ErrorInformation.message || "Fortnox-fel vid fakturaskapande") };
  }

  const invoiceNumber = result?.data?.Invoice?.DocumentNumber;
  if (!invoiceNumber) {
    return { error: "Inget fakturanummer returnerades från Fortnox" };
  }
  return { invoiceNumber: String(invoiceNumber), extRef1 };
}

export async function POST(request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value || "default_user";
  let token = await getToken(cookieStore, userId);

  if (!token) {
    return Response.json(
      { ok: false, error: "Ingen Fortnox-token. Klicka 'Återaktivera Fortnox'." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const invoices = Array.isArray(body?.invoices) ? body.invoices : [];

  if (invoices.length === 0) {
    return Response.json({ ok: false, error: "Inga fakturor att skapa" }, { status: 400 });
  }

  const results = [];

  for (const inv of invoices) {
    const orgNumber = String(inv.orgNumber || "").trim();
    const discountPercent = Math.max(0, Math.min(100, Number(inv.discountPercent || 0)));
    const rows = Array.isArray(inv.rows) ? inv.rows : [];
    const presetCustomerNumber = String(inv.customerNumber || "").trim();

    if (!orgNumber) {
      results.push({ orgNumber, ok: false, error: "Organisationsnummer saknas" });
      continue;
    }
    if (rows.length === 0) {
      results.push({ orgNumber, ok: false, error: "Inga artikelrader" });
      continue;
    }

    try {
      let customerNumber = presetCustomerNumber;

      if (!customerNumber) {
        // Slå upp kundnummer via org.nummer
        let lookup = await lookupCustomerNumber(orgNumber, token);
        if (lookup.rateLimited) {
          await delay(lookup.retryAfter + 400);
          lookup = await lookupCustomerNumber(orgNumber, token);
        }
        if (lookup?.notFound) {
          const newToken = await doRefreshToken(cookieStore, userId);
          if (newToken) {
            token = newToken;
            lookup = await lookupCustomerNumber(orgNumber, token);
          }
        }
        if (lookup?.notFound) {
          results.push({ orgNumber, ok: false, error: `Kund med org.nummer ${orgNumber} hittades inte i Fortnox` });
          continue;
        }
        if (!lookup?.customerNumber) {
          results.push({ orgNumber, ok: false, error: "Kunde inte slå upp kund i Fortnox" });
          continue;
        }
        customerNumber = lookup.customerNumber;
      }
      const invoiceDate = String(inv.invoiceDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      const yyyyMM = invoiceDate.slice(0, 7);
      const extRef1 = `Fortnoxlicenser ${yyyyMM} ${customerNumber}`;

      // Dublettkontroll — hoppa över om faktura redan finns
      let dupCheck = await findExistingInvoice(extRef1, customerNumber, token);
      if (dupCheck.rateLimited) {
        await delay(dupCheck.retryAfter + 400);
        dupCheck = await findExistingInvoice(extRef1, customerNumber, token);
      }
      if (dupCheck?.found) {
        results.push({ orgNumber, customerNumber, invoiceNumber: dupCheck.invoiceNumber, ok: false, skipped: true, error: `Faktura fanns redan (${dupCheck.invoiceNumber})` });
        continue;
      }

      // Skapa faktura
      let creation = await createFortnoxInvoice(customerNumber, rows, discountPercent, invoiceDate, token);
      if (creation.rateLimited) {
        await delay(creation.retryAfter + 400);
        creation = await createFortnoxInvoice(customerNumber, rows, discountPercent, invoiceDate, token);
      }
      if (creation.error) {
        const newToken = await doRefreshToken(cookieStore, userId);
        if (newToken) {
          token = newToken;
          creation = await createFortnoxInvoice(customerNumber, rows, discountPercent, invoiceDate, token);
        }
      }
      if (creation.error) {
        results.push({ orgNumber, customerNumber, ok: false, error: creation.error });
        continue;
      }

      results.push({ orgNumber, customerNumber, invoiceNumber: creation.invoiceNumber, extRef1: creation.extRef1, ok: true });
      await delay(200);
    } catch (err) {
      console.error(`Fel vid skapande av faktura för ${orgNumber}:`, err);
      results.push({ orgNumber, ok: false, error: String(err?.message || "Oväntat fel") });
    }
  }

  const created = results.filter(r => r.ok).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.ok && !r.skipped).length;

  return Response.json({ ok: true, results, created, skipped, failed });
}
