import { getInvoiceRowsForInvoices } from "@/lib/supabase";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const invoiceNumbers = Array.isArray(body?.invoiceNumbers)
      ? body.invoiceNumbers.map(value => String(value || "").trim()).filter(Boolean)
      : [];

    const uniqueInvoiceNumbers = Array.from(new Set(invoiceNumbers)).slice(0, 300);
    if (uniqueInvoiceNumbers.length === 0) {
      return Response.json({ ok: true, rowsByInvoice: {} });
    }

    const rows = await getInvoiceRowsForInvoices(uniqueInvoiceNumbers);
    const rowsByInvoice = {};

    uniqueInvoiceNumbers.forEach(invoiceNumber => {
      rowsByInvoice[invoiceNumber] = [];
    });

    (rows || []).forEach(row => {
      const invoiceNumber = String(row.invoice_number || "").trim();
      if (!invoiceNumber || !(invoiceNumber in rowsByInvoice)) return;
      rowsByInvoice[invoiceNumber].push(row);
    });

    return Response.json({ ok: true, rowsByInvoice });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || "Kunde inte hämta invoice_rows" },
      { status: 500 }
    );
  }
}
