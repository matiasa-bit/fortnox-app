const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

if (!svc || !supabaseUrl) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

const base = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/invoice_rows`;
const headers = {
  apikey: svc,
  Authorization: `Bearer ${svc}`,
  Prefer: 'return=representation',
  Accept: 'application/json'
};

async function del(query) {
  const url = base + query;
  console.log('DELETE', url);
  try {
    const res = await fetch(url, { method: 'DELETE', headers });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Body:', text || '<empty>');
  } catch (err) {
    console.error('Request failed', err);
  }
}

(async () => {
  await del('?article_number=is.null');
  await del('?total=lte.0');
})();
