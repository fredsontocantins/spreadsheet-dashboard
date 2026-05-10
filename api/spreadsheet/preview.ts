import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const sheet = formData.get('sheet') || 'Sheet1';

    if (!file) return Response.json({ success: false, error: 'Nenhum arquivo' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name;
    const isCSV = filename.toLowerCase().endsWith('.csv');

    let workbook, sheetNames;
    if (isCSV) {
      const text = buffer.toString('utf8');
      const records = csvParse(text, { columns: true, skip_empty_lines: true, trim: true });
      const ws = XLSX.utils.json_to_sheet(records);
      workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, ws, 'Sheet1');
      sheetNames = ['Sheet1'];
    } else {
      workbook = XLSX.read(buffer, { type: 'buffer' });
      sheetNames = workbook.SheetNames;
    }

    const targetSheet = sheet || sheetNames[0];
    const ws = workbook.Sheets[targetSheet];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (raw.length < 1) return Response.json({ success: false, error: 'Planilha vazia' });

    const headers = raw[0].map(String);
    const data = raw.slice(1).map(row => {
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? '' });
      return obj;
    });

    return Response.json({
      success: true, filename, sheet: targetSheet, sheets: sheetNames.map(n => ({ name: n })),
      totalRows: data.length, headers, data: data.slice(0, 50),
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
