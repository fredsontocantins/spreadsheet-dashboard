import XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';

export async function POST(request) {
  try {
    const body = await request.json();
    const { filters = {}, page = 1, limit = 50, sheet = 'Sheet1' } = body;

    const fileData = body._fileData as string | undefined;
    const filename = body._filename as string || 'file.xlsx';

    if (!fileData) return Response.json({ success: false, error: 'Arquivo não encontrado' }, { status: 400 });

    const buffer = Buffer.from(fileData, 'base64');
    const isCSV = filename.toLowerCase().endsWith('.csv');

    let workbook, raw;
    if (isCSV) {
      const text = buffer.toString('utf8');
      const records = csvParse(text, { columns: true, skip_empty_lines: true, trim: true });
      const ws = XLSX.utils.json_to_sheet(records);
      workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, ws, 'Sheet1');
      raw = XLSX.utils.sheet_to_json(workbook.Sheets['Sheet1'], { header: 1, defval: '' });
    } else {
      workbook = XLSX.read(buffer, { type: 'buffer' });
      raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheet] || workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
    }

    if (raw.length < 1) return Response.json({ success: false, error: 'Planilha vazia' });

    const headers = raw[0].map(String);
    let data = raw.slice(1).map((row, rowIdx) => {
      const obj: any = { _rowIdx: rowIdx };
      headers.forEach((h, i) => { obj[h] = row[i] ?? '' });
      return obj;
    });

    if (Object.keys(filters).length > 0) {
      data = data.filter(row => {
        return Object.entries(filters).every(([col, f: any]) => {
          if (!f?.value) return true;
          const val = String(row[col] ?? '').toLowerCase();
          return val.includes(String(f.value).toLowerCase());
        });
      });
    }

    const total = data.length;
    const start = (page - 1) * limit;
    const paged = data.slice(start, start + limit);

    return Response.json({
      success: true, data: paged, pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      headers, filename, totalRows: total, sheet,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
