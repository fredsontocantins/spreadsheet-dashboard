import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function hashBuffer(buffer) {
  const data = new Uint8Array(buffer);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < data.length; i++) {
    h1 = Math.imul(h1 ^ Math.imul(data[i], 2654435761), 597399067);
    h2 = Math.imul(h2 ^ Math.imul(data[i], 1597334677), 3812015801);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 4242875139);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489911);
  return `${(h1 ^ h2) >>> 0}`;
}

async function getSnapshotsByHash(supabase, pdfHash, scale) {
  const { data, error } = await supabase
    .from('pdf_snapshots')
    .select('*')
    .eq('pdf_hash', pdfHash)
    .eq('scale', scale)
    .order('page_number', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function upsertSnapshots(supabase, rows) {
  const { data, error } = await supabase.from('pdf_snapshots').upsert(rows, {
    onConflict: 'pdf_hash,scale,page_number',
  });
  if (error) throw error;
  return data;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const scale = parseInt(formData.get('scale') || '2', 10);
    const pdfName = file?.name || 'unknown.pdf';

    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      return Response.json({ success: false, error: 'Arquivo deve ser PDF' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfHash = hashBuffer(buffer);

    const supabase = getClient();
    const existing = await getSnapshotsByHash(supabase, pdfHash, scale);

    const pagesDone = existing.filter(s => s.status === 'done').length;
    const totalPages = existing.length > 0 ? existing[0].page_number : null;
    const allDone = existing.length > 0 && existing.every(s => s.status === 'done');

    return Response.json({
      success: true,
      pdf_name: pdfName,
      pdf_hash: pdfHash,
      scale,
      pages: totalPages,
      pages_done: pagesDone,
      all_done: allDone,
      snapshots: existing.map(s => ({
        id: s.id,
        page: s.page_number,
        status: s.status,
        image_url: s.image_url,
        created_at: s.created_at,
      })),
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
