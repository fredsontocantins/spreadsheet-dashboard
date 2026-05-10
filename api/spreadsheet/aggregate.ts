import XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';

export async function POST(request) {
  try {
    const body = await request.json();
    const { groupBy, aggregations = [], sheet = 'Sheet1' } = body;

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

    if (raw.length < 2) return Response.json({ success: false, error: 'Dados insuficientes' });

    const headers = raw[0].map(String);
    const data = raw.slice(1).map(row => {
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? '' });
      return obj;
    });

    const groups: any = {};
    for (const row of data) {
      const key = String(row[groupBy] ?? '__null__');
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }

    const result = Object.entries(groups).map(([key, rows: any[]]) => {
      const entry: any = { [groupBy]: key === '__null__' ? '' : key };
      for (const agg of aggregations) {
        const vals = rows.map(r => parseFloat(String(r[agg.field] ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0);
        switch (agg.operation) {
          case 'sum': entry[agg.as || agg.field] = vals.reduce((a, b) => a + b, 0); break;
          case 'avg': entry[agg.as || agg.field] = vals.reduce((a, b) => a + b, 0) / vals.length; break;
          case 'min': entry[agg.as || agg.field] = Math.min(...vals); break;
          case 'max': entry[agg.as || agg.field] = Math.max(...vals); break;
          case 'count': entry[agg.as || agg.field] = vals.length; break;
        }
      }
      return entry;
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
