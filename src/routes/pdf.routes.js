import { Router } from 'express';
import { 
  extractTextFromPDF,
  searchInText,
  extractStructuredData,
  extractNumbers,
  extractEmails,
  extractUrls,
  extractDates,
  paginateText,
  summarizeContent
} from '../services/pdf.service.js';

const router = Router();

router.post('/upload', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    if (!req.file.originalname.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ success: false, error: 'Arquivo deve ser PDF' });
    }
    
    const result = await extractTextFromPDF(req.file.buffer);
    
    res.json({
      success: true,
      filename: req.file.originalname,
      pages: result.pages,
      charCount: result.text.length,
      info: result.info
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/text', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const { page: pageNum, charsPerPage = 2000 } = req.body;
    const result = await extractTextFromPDF(req.file.buffer);
    
    if (pageNum !== undefined) {
      const pages = paginateText(result.text, charsPerPage);
      const page = pages[pageNum - 1] || '';
      
      return res.json({
        success: true,
        page: pageNum,
        totalPages: pages.length,
        text: page
      });
    }
    
    const pages = paginateText(result.text, charsPerPage);
    
    res.json({
      success: true,
      totalPages: pages.length,
      text: result.text,
      pages: pages
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/search', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const { query, caseSensitive = false, maxResults = 100 } = req.body;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query é obrigatória' });
    }
    
    const result = await extractTextFromPDF(req.file.buffer);
    const matches = searchInText(result.text, query, caseSensitive);
    
    res.json({
      success: true,
      query,
      totalMatches: matches.length,
      matches: matches.slice(0, maxResults)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/extract', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const { types = ['numbers', 'emails', 'urls', 'dates'] } = req.body;
    const result = await extractTextFromPDF(req.file.buffer);
    
    const extracted = {};
    
    if (types.includes('numbers')) {
      extracted.numbers = extractNumbers(result.text);
    }
    if (types.includes('emails')) {
      extracted.emails = extractEmails(result.text);
    }
    if (types.includes('urls')) {
      extracted.urls = extractUrls(result.text);
    }
    if (types.includes('dates')) {
      extracted.dates = extractDates(result.text);
    }
    
    res.json({
      success: true,
      ...extracted
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/structure', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const result = await extractTextFromPDF(req.file.buffer);
    const structure = extractStructuredData(result.text);
    
    res.json({
      success: true,
      ...structure
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/summary', async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    
    const { maxLength = 500 } = req.body;
    const result = await extractTextFromPDF(req.file.buffer);
    const summary = summarizeContent(result.text, maxLength);
    
    res.json({
      success: true,
      summary,
      originalLength: result.text.length,
      summaryLength: summary.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;