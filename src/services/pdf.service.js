import pdfParse from 'pdf-parse';

export async function extractTextFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      pages: data.numpages,
      info: data.info || {}
    };
  } catch (error) {
    throw new Error(`Erro ao extrair texto do PDF: ${error.message}`);
  }
}

export function searchInText(text, query, caseSensitive = false) {
  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  
  const matches = [];
  let index = 0;
  
  while ((index = searchText.indexOf(searchQuery, index)) !== -1) {
    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + query.length + 50);
    const context = text.substring(start, end);
    
    matches.push({
      index,
      position: index,
      context: (start > 0 ? '...' : '') + context + (end < text.length ? '...' : ''),
      before: text.substring(start, index),
      match: text.substring(index, index + query.length),
      after: text.substring(index + query.length, end)
    });
    
    index += query.length;
  }
  
  return matches;
}

export function extractStructuredData(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const data = {
    paragraphs: [],
    tables: [],
    lists: [],
    headers: [],
    totalLines: lines.length,
    totalChars: text.length
  };
  
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    
    if (/^[A-Z0-9\s]{3,}:?\s/.test(trimmed) && trimmed.length < 100) {
      data.headers.push({ level: 1, text: trimmed, line: i });
    } else if (/^\d+\.\s/.test(trimmed)) {
      data.lists.push({ type: 'numbered', text: trimmed, line: i });
    } else if (/^[-•*]\s/.test(trimmed)) {
      data.lists.push({ type: 'bullet', text: trimmed, line: i });
    }
    
    if (trimmed && trimmed.length > 20) {
      data.paragraphs.push({ text: trimmed, line: i });
    }
  });
  
  return data;
}

export function extractNumbers(text) {
  const numberRegex = /-?R?\s*\$?\s*[\d.,]+/g;
  const matches = text.match(numberRegex) || [];
  
  return matches.map(m => ({
    value: m,
    parsed: parseFloat(m.replace(/[^0-9.,-]/g, '').replace(',', '.'))
  }));
}

export function extractEmails(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return text.match(emailRegex) || [];
}

export function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s]+/g;
  return text.match(urlRegex) || [];
}

export function extractDates(text) {
  const datePatterns = [
    /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
    /\d{1,2}-\d{1,2}-\d{2,4}/g,
    /\d{4}-\d{2}-\d{2}/g,
    /\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/gi
  ];
  
  const dates = [];
  datePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) dates.push(...matches);
  });
  
  return [...new Set(dates)];
}

export function paginateText(text, charsPerPage = 2000) {
  const pages = [];
  const lines = text.split(/\r?\n/);
  let currentPage = '';
  let currentSize = 0;
  
  lines.forEach(line => {
    if (currentSize + line.length > charsPerPage && currentPage) {
      pages.push(currentPage.trim());
      currentPage = '';
      currentSize = 0;
    }
    currentPage += line + '\n';
    currentSize += line.length + 1;
  });
  
  if (currentPage.trim()) {
    pages.push(currentPage.trim());
  }
  
  return pages;
}

export function summarizeContent(text, maxLength = 500) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  let summary = '';
  
  for (const sentence of sentences) {
    if (summary.length + sentence.length > maxLength) break;
    summary += sentence.trim() + '. ';
  }
  
  return summary.trim() || text.substring(0, maxLength) + '...';
}