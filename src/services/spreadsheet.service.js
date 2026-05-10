import XLSX from 'xlsx';
import { parse as parseCSV } from 'csv-parse/sync';

export async function readSpreadsheet(buffer, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  let workbook;

  if (ext === 'xlsx' || ext === 'xls') {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } else if (ext === 'csv') {
    const records = parseCSV(buffer, { 
      columns: true, 
      skip_empty_lines: true, 
      trim: true,
      relax_column_count: true 
    });
    return { 
      sheets: [{ 
        name: 'data', 
        data: records, 
        headers: records.length > 0 ? Object.keys(records[0]) : [] 
      }] 
    };
  } else {
    throw new Error(`Formato não suportado: ${ext}`);
  }

  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { 
      defval: '',
      raw: false,
      dateNF: 'yyyy-mm-dd'
    });
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    return { name, data, headers };
  });
}

export function filterData(data, filters = {}) {
  return data.filter(row => {
    for (const [field, condition] of Object.entries(filters)) {
      if (!condition || condition.value === undefined || condition.value === '') continue;
      
      const cellValue = String(row[field] ?? '').toLowerCase();
      const filterValue = String(condition.value).toLowerCase();
      
      switch (condition.operator) {
        case 'equals':
          if (cellValue !== filterValue) return false;
          break;
        case 'contains':
          if (!cellValue.includes(filterValue)) return false;
          break;
        case 'startsWith':
          if (!cellValue.startsWith(filterValue)) return false;
          break;
        case 'endsWith':
          if (!cellValue.endsWith(filterValue)) return false;
          break;
        case 'greaterThan':
          if (parseFloat(cellValue) <= parseFloat(filterValue)) return false;
          break;
        case 'lessThan':
          if (parseFloat(cellValue) >= parseFloat(filterValue)) return false;
          break;
        case 'notEquals':
          if (cellValue === filterValue) return false;
          break;
        case 'isEmpty':
          if (cellValue.trim() !== '') return false;
          break;
        case 'isNotEmpty':
          if (cellValue.trim() === '') return false;
          break;
      }
    }
    return true;
  });
}

export function sortData(data, sortConfig = {}) {
  const { field, direction = 'asc' } = sortConfig;
  if (!field) return data;

  return [...data].sort((a, b) => {
    const valA = a[field];
    const valB = b[field];
    const numA = parseFloat(valA);
    const numB = parseFloat(valB);
    
    let comparison;
    if (!isNaN(numA) && !isNaN(numB)) {
      comparison = numA - numB;
    } else {
      comparison = String(valA ?? '').localeCompare(String(valB ?? ''));
    }
    
    return direction === 'desc' ? -comparison : comparison;
  });
}

export function aggregateData(data, groupBy, aggregations = []) {
  if (!aggregations.length) return data;

  const groups = {};
  
  data.forEach(row => {
    const key = groupBy ? String(row[groupBy] ?? 'N/A') : 'all';
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });

  return Object.entries(groups).map(([key, rows]) => {
    const result = { [groupBy || 'category']: key, total: rows.length };
    
    aggregations.forEach(agg => {
      const values = rows
        .map(r => parseFloat(r[agg.field]) || 0)
        .filter(v => !isNaN(v));
      
      const prefix = agg.as || agg.field;
      
      switch (agg.operation) {
        case 'sum':
          result[`${prefix}_sum`] = values.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          result[`${prefix}_avg`] = values.length 
            ? values.reduce((a, b) => a + b, 0) / values.length 
            : 0;
          break;
        case 'min':
          result[`${prefix}_min`] = values.length ? Math.min(...values) : 0;
          break;
        case 'max':
          result[`${prefix}_max`] = values.length ? Math.max(...values) : 0;
          break;
        case 'count':
          result[`${prefix}_count`] = values.filter(v => v !== 0).length;
          break;
      }
    });
    
    return result;
  });
}

export function getStatistics(data, fields = []) {
  if (!fields.length) {
    const numericFields = data.length > 0 
      ? Object.keys(data[0]).filter(k => 
          data.slice(0, 10).every(r => !isNaN(parseFloat(r[k])))
        )
      : [];
    fields = numericFields;
  }

  const stats = {};
  
  fields.forEach(field => {
    const values = data
      .map(r => parseFloat(r[field]))
      .filter(v => !isNaN(v) && v !== 0);
    
    if (values.length > 0) {
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      
      stats[field] = {
        count: values.length,
        sum: Math.round(sum * 100) / 100,
        avg: Math.round((sum / values.length) * 100) / 100,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: sorted[Math.floor(sorted.length / 2)],
        range: sorted[sorted.length - 1] - sorted[0]
      };
    }
  });
  
  return stats;
}

export function transformData(data, transformations = []) {
  return data.map(row => {
    const newRow = { ...row };
    
    transformations.forEach(t => {
      if (t.type === 'rename' && t.field && t.newName) {
        newRow[t.newName] = row[t.field];
        delete newRow[t.field];
      } 
      else if (t.type === 'calculate' && t.field && t.formula) {
        try {
          const formula = t.formula.replace(/\[(\w+)\]/g, (_, name) => parseFloat(row[name]) || 0);
          newRow[t.field] = Math.round(eval(formula) * 100) / 100;
        } catch {
          newRow[t.field] = 0;
        }
      } 
      else if (t.type === 'format' && t.field && t.format) {
        const val = row[t.field];
        switch (t.format) {
          case 'currency':
            newRow[t.field] = `R$ ${parseFloat(val || 0).toFixed(2).replace('.', ',')}`;
            break;
          case 'percentage':
            newRow[t.field] = `${parseFloat(val || 0).toFixed(2)}%`;
            break;
          case 'uppercase':
            newRow[t.field] = String(val || '').toUpperCase();
            break;
          case 'lowercase':
            newRow[t.field] = String(val || '').toLowerCase();
            break;
          case 'trim':
            newRow[t.field] = String(val || '').trim();
            break;
          case 'abs':
            newRow[t.field] = Math.abs(parseFloat(val) || 0);
            break;
        }
      }
    });
    
    return newRow;
  });
}

export function paginateData(data, page = 1, limit = 50) {
  const total = data.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const paginated = data.slice(start, start + limit);
  
  return {
    data: paginated,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

export function exportToFile(data, format = 'xlsx') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  
  if (format === 'csv') {
    return XLSX.utils.sheet_to_csv(ws);
  }
  
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}