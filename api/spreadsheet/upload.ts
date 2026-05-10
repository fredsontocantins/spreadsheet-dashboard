import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function parseFormData(request) {
  return request.formData();
}

export async function POST(request) {
  try {
    const formData = await parseFormData(request);
    const file = formData.get('file');
    if (!file) return Response.json({ success: false, error: 'Nenhum arquivo' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name;
    const isCSV = filename.toLowerCase().endsWith('.csv');

    let workbook;
    if (isCSV) {
      const text = buffer.toString('utf8');
      const records = csvParse(text, { columns: true, skip_empty_lines: true, trim: true });
      const ws = XLSX.utils.json_to_sheet(records);
      workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, ws, 'Sheet1');
    } else {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    }

    const sheets = workbook.SheetNames.map(name => ({ name }));

    return Response.json({ success: true, sheets });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
