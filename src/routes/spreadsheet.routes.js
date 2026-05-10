import { Router } from 'express';
import { 
  readSpreadsheet, 
  filterData, 
  sortData, 
  aggregateData, 
  getStatistics, 
  transformData,
  paginateData,
  exportToFile 
} from '../services/spreadsheet.service.js';

const router = Router();

router.post('/upload', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const sheets = await readSpreadsheet(req.file.buffer, req.file.originalname);
    
    res.json({
      success: true,
      filename: req.file.originalname,
      format: req.file.originalname.split('.').pop(),
      sheets: sheets.map(s => ({
        name: s.name,
        rows: s.data.length,
        columns: s.headers
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/preview', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const sheets = await readSpreadsheet(req.file.buffer, req.file.originalname);
    const { limit = 10, sheet: sheetName } = req.body;
    
    let sheet = sheets[0];
    if (sheetName) {
      const found = sheets.find(s => s.name === sheetName);
      if (found) sheet = found;
    }
    
    res.json({
      success: true,
      filename: req.file.originalname,
      sheetName: sheet.name,
      data: sheet.data.slice(0, limit),
      totalRows: sheet.data.length,
      headers: sheet.headers
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/query', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const { 
      filters = {}, 
      sort = {}, 
      page = 1, 
      limit = 50,
      sheet: sheetName 
    } = req.body;
    
    const sheets = await readSpreadsheet(req.file.buffer, req.file.originalname);
    let data = sheetName 
      ? sheets.find(s => s.name === sheetName)?.data || sheets[0].data
      : sheets[0].data;
    
    data = filterData(data, filters);
    data = sortData(data, sort);
    
    const result = paginateData(data, page, limit);
    
    res.json({
      success: true,
      ...result,
      filters,
      sort
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/aggregate', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const { groupBy, aggregations = [], sheet: sheetName } = req.body;
    
    const sheets = await readSpreadsheet(req.file.buffer, req.file.originalname);
    let data = sheetName 
      ? sheets.find(s => s.name === sheetName)?.data || sheets[0].data
      : sheets[0].data;
    
    if (req.body.filters) {
      data = filterData(data, req.body.filters);
    }
    
    const result = aggregateData(data, groupBy, aggregations);
    
    res.json({
      success: true,
      data: result,
      totalGroups: result.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/statistics', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const { fields = [], sheet: sheetName } = req.body;
    
    const sheets = await readSpreadsheet(req.file.buffer, req.file.originalname);
    let data = sheetName 
      ? sheets.find(s => s.name === sheetName)?.data || sheets[0].data
      : sheets[0].data;
    
    if (req.body.filters) {
      data = filterData(data, req.body.filters);
    }
    
    const stats = getStatistics(data, fields);
    
    res.json({
      success: true,
      statistics: stats,
      totalRows: data.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/transform', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const { transformations = [], sheet: sheetName } = req.body;
    
    const sheets = await readSpreadsheet(req.file.buffer, req.file.originalname);
    let data = sheetName 
      ? sheets.find(s => s.name === sheetName)?.data || sheets[0].data
      : sheets[0].data;
    
    if (req.body.filters) data = filterData(data, req.body.filters);
    if (req.body.sort) data = sortData(data, req.body.sort);
    if (transformations.length) data = transformData(data, transformations);
    
    res.json({
      success: true,
      data,
      count: data.length,
      transformationsApplied: transformations.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/export', async (req, res) => {
  try {
    const { data, filename = 'export', format = 'xlsx' } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ success: false, error: 'Dados inválidos' });
    }
    
    if (format === 'csv') {
      const csv = exportToFile(data, 'csv');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send('\ufeff' + csv);
    } else {
      const buffer = exportToFile(data, 'xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      res.send(buffer);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;