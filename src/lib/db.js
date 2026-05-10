const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function supabaseFetch(table, options = {}) {
  const { method = 'GET', body, params } = options;
  let url = `${SUPABASE_URL}/rest/v1/${table}`;

  if (params) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => q.append(k, v));
    url += '?' + q.toString();
  }

  return fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : '',
      ...(options.headers || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(r => r.json());
}

export async function getSnapshotsByHash(pdfHash, scale) {
  return supabaseFetch('pdf_snapshots', {
    params: {
      pdf_hash: `eq.${pdfHash}`,
      scale: `eq.${scale}`,
      select: '*',
      order: 'page_number.asc',
    },
  });
}

export async function getSnapshotStatus(pdfHash, scale) {
  const data = await supabaseFetch('pdf_snapshots', {
    params: {
      pdf_hash: `eq.${pdfHash}`,
      scale: `eq.${scale}`,
      select: 'status, count',
      count: 'exact',
    },
  });
  if (!Array.isArray(data) || data.length === 0) return null;
  return data;
}

export async function upsertSnapshot(row) {
  return supabaseFetch('pdf_snapshots', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge' },
    body: row,
  });
}

export async function updateSnapshot(id, updates) {
  return supabaseFetch(`pdf_snapshots?id=eq.${id}`, {
    method: 'PATCH',
    body: updates,
  });
}

export async function upsertSnapshotsBatch(rows) {
  return supabaseFetch('pdf_snapshots', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge' },
    body: rows,
  });
}
