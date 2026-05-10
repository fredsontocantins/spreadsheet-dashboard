import XLSX from 'xlsx';

export async function POST(request) {
  try {
    const body = await request.json();
    const { data = [], filename: _filename = 'export', format = 'csv' } = body;

    if (!data.length) return Response.json({ success: false, error: 'Sem dados' }, { status: 400 });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    let buffer, mime;
    if (format === 'xlsx') {
      buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      buffer = XLSX.write(wb, { bookType: 'csv', type: 'buffer' });
      mime = 'text/csv;charset=utf-8';
    }

    return new Response(buffer, {
      headers: { 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${_filename}.${format}"` },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
