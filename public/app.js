let currentSpreadsheetData = null;
let currentSpreadsheetFile = null;
let currentPdfFiles = [];
let currentSelectedPdfIndex = 0;
let currentFilters = {};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSpreadsheetUpload();
  initPdfUpload();
  initPdfSubtabs();
  initSpreadsheetAggregateFields();
  initPdfFileActions();
  document.getElementById('btn-generate-all-snapshots').addEventListener('click', generateAllSnapshotsInBatch);
  document.getElementById('btn-download-all-zip').addEventListener('click', downloadCompleteZip);
  document.getElementById('btn-clear-all-pdfs').addEventListener('click', clearAllPdfs);
});

function initPdfFileActions() {}

function initPdfSubtabs() {
  document.querySelectorAll('.pdf-subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pdf-subtab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.pdf-subtab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('pdf-' + tab.dataset.pdftab).classList.add('active');
    });
  });
}

function initSpreadsheetAggregateFields() {
  const sheetSelector = document.getElementById('sheet-selector');
  if (sheetSelector) sheetSelector.addEventListener('change', updateAggregateFields);
}

function initPdfFileActions() {
  const btnGenerate = document.getElementById('btn-generate-all-snapshots');
  const btnDownloadZip = document.getElementById('btn-download-all-zip');
  const btnClear = document.getElementById('btn-clear-all-pdfs');

  if (btnGenerate) btnGenerate.addEventListener('click', generateAllSnapshotsInBatch);
  if (btnDownloadZip) btnDownloadZip.addEventListener('click', downloadCompleteZip);
  if (btnClear) btnClear.addEventListener('click', clearAllPdfs);
}

function getSelectedPdf() {
  if (currentPdfFiles.length === 0) return null;
  const idx = Math.min(currentSelectedPdfIndex, currentPdfFiles.length - 1);
  return currentPdfFiles[idx >= 0 ? idx : 0];
}

function initSpreadsheetUpload() {
  const dropzone = document.getElementById('spreadsheet-dropzone');
  const input = document.getElementById('spreadsheet-file');
  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); handleSpreadsheetFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', (e) => { if (e.target.files[0]) handleSpreadsheetFile(e.target.files[0]); });
}

async function handleSpreadsheetFile(file) {
  const dropzone = document.getElementById('spreadsheet-dropzone');
  try {
    showLoading(dropzone, true);
    currentSpreadsheetFile = file;
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/spreadsheet/upload', { method: 'POST', body: formData });
    const result = await response.json();
    if (!result.success) { showToast(result.error || 'Erro', 'error'); return; }
    showToast('Arquivo carregado!', 'success');
    const previewRes = await fetch('/api/spreadsheet/preview', { method: 'POST', body: formData });
    const preview = await previewRes.json();
    currentSpreadsheetData = preview;
    populateSheetSelector(result.sheets);
    renderStats(preview);
    renderTable(preview);
    renderFilters(preview.headers);
    updateAggregateFieldsFromHeaders(preview.headers);
    document.getElementById('spreadsheet-stats').style.display = 'block';
    document.getElementById('spreadsheet-data').style.display = 'block';
    document.getElementById('spreadsheet-aggregate').style.display = 'block';
  } catch (error) { showToast('Erro: ' + error.message, 'error'); }
  finally { showLoading(dropzone, false); }
}

function updateAggregateFieldsFromHeaders(headers) {
  const groupBySelect = document.getElementById('agg-group-by');
  const aggFieldSelect = document.getElementById('agg-field');
  if (groupBySelect) groupBySelect.innerHTML = (headers || []).map(h => `<option value="${h}">${h}</option>`).join('');
  if (aggFieldSelect) aggFieldSelect.innerHTML = (headers || []).map(h => `<option value="${h}">${h}</option>`).join('');
}

function populateSheetSelector(sheets) {
  const selector = document.getElementById('sheet-selector');
  selector.innerHTML = '';
  sheets.forEach(s => { const opt = document.createElement('option'); opt.value = s.name; opt.textContent = `${s.name} (${s.rows} linhas)`; selector.appendChild(opt); });
}

function renderStats(data) {
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="value">${data.totalRows}</div><div class="label">Linhas</div></div>
    <div class="stat-card"><div class="value">${data.headers?.length || 0}</div><div class="label">Colunas</div></div>
    <div class="stat-card"><div class="value">${data.filename?.split('.').pop().toUpperCase() || 'N/A'}</div><div class="label">Formato</div></div>
  `;
}

function renderTable(data) {
  const thead = document.querySelector('#spreadsheet-table thead');
  const tbody = document.querySelector('#spreadsheet-table tbody');
  thead.innerHTML = '<tr>' + (data.headers || []).map(h => `<th>${h}</th>`).join('') + '</tr>';
  tbody.innerHTML = '';
  (data.data || []).forEach(row => { const tr = document.createElement('tr'); tr.innerHTML = (data.headers || []).map(h => `<td>${row[h] ?? ''}</td>`).join(''); tbody.appendChild(tr); });
  renderPagination(data.totalRows, 1, 50);
}

function renderFilters(headers) {
  const grid = document.getElementById('filters-grid');
  grid.innerHTML = '';
  (headers || []).slice(0, 6).forEach(header => {
    const div = document.createElement('div');
    div.className = 'filter-group';
    div.innerHTML = `
      <label>${header}</label>
      <div style="display:flex;gap:4px;">
        <select class="filter-op" data-field="${header}" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:12px;">
          <option value="contains">Contém</option><option value="equals">Igual</option><option value="startsWith">Começa com</option>
          <option value="endsWith">Termina com</option><option value="greaterThan">Maior que</option><option value="lessThan">Menor que</option>
          <option value="notEquals">Diferente</option><option value="isEmpty">Vazio</option><option value="isNotEmpty">Não vazio</option>
        </select>
        <input type="text" class="filter-val" data-field="${header}" placeholder="Valor" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-size:12px;width:100px;">
      </div>
    `;
    grid.appendChild(div);
  });
}

function renderPagination(total, page, limit) {
  const container = document.getElementById('spreadsheet-pagination');
  const totalPages = Math.ceil(total / limit);
  let html = `<button onclick="changePage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>◀</button>`;
  for (let i = 1; i <= Math.min(totalPages, 5); i++) { html += `<button onclick="changePage(${i})" ${i === page ? 'style="background:var(--primary);color:white;border-color:var(--primary)"' : ''}>${i}</button>`; }
  html += `<button onclick="changePage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>▶</button><span>Página ${page} de ${totalPages}</span>`;
  container.innerHTML = html;
}

async function changePage(page) { await applySpreadsheetFilters(page); }

async function applySpreadsheetFilters(page = 1) {
  const filters = {};
  document.querySelectorAll('.filter-op, .filter-val').forEach(el => {
    const field = el.dataset.field;
    if (!filters[field]) filters[field] = {};
    if (el.classList.contains('filter-op')) filters[field].operator = el.value;
    else filters[field].value = el.value;
  });
  const formData = new FormData();
  formData.append('file', currentSpreadsheetFile);
  try {
    const response = await fetch('/api/spreadsheet/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters, page, limit: 50, sheet: document.getElementById('sheet-selector').value }) });
    const result = await response.json();
    if (result.success) renderTableFromQuery(result);
  } catch (error) { showToast('Erro', 'error'); }
}

function renderTableFromQuery(result) {
  const thead = document.querySelector('#spreadsheet-table thead');
  const tbody = document.querySelector('#spreadsheet-table tbody');
  const headers = Object.keys(result.data[0] || {});
  thead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
  tbody.innerHTML = '';
  result.data.forEach(row => { const tr = document.createElement('tr'); tr.innerHTML = headers.map(h => `<td>${row[h] ?? ''}</td>`).join(''); tbody.appendChild(tr); });
  if (result.pagination) renderPagination(result.pagination.total, result.pagination.page, result.pagination.limit);
}

async function clearSpreadsheetFilters() { document.querySelectorAll('.filter-val').forEach(el => el.value = ''); await applySpreadsheetFilters(1); }

async function runAggregation() {
  if (!currentSpreadsheetFile) return;
  const formData = new FormData();
  formData.append('file', currentSpreadsheetFile);
  try {
    const response = await fetch('/api/spreadsheet/aggregate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupBy: document.getElementById('agg-group-by').value, aggregations: [{ field: document.getElementById('agg-field').value, operation: document.getElementById('agg-operation').value, as: document.getElementById('agg-field').value }], sheet: document.getElementById('sheet-selector').value }) });
    const result = await response.json();
    if (result.success) {
      const thead = document.querySelector('#aggregate-table thead');
      const tbody = document.querySelector('#aggregate-table tbody');
      if (result.data.length === 0) { tbody.innerHTML = '<tr><td colspan="10">Nenhum dado</td></tr>'; return; }
      const headers = Object.keys(result.data[0]);
      thead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
      tbody.innerHTML = '';
      result.data.forEach(row => { const tr = document.createElement('tr'); tr.innerHTML = headers.map(h => `<td>${row[h] ?? ''}</td>`).join(''); tbody.appendChild(tr); });
    }
  } catch (error) { showToast('Erro', 'error'); }
}

async function exportSpreadsheet(format) {
  if (!currentSpreadsheetFile) return;
  const response = await fetch('/api/spreadsheet/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 1, limit: 10000, sheet: document.getElementById('sheet-selector').value }) });
  const result = await response.json();
  if (result.success) {
    const exportRes = await fetch('/api/spreadsheet/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: result.data, filename: 'export', format }) });
    const blob = await exportRes.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `export.${format}`; a.click();
  }
}

function initPdfUpload() {
  const dropzone = document.getElementById('pdf-dropzone');
  const input = document.getElementById('pdf-file');
  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); handleMultiplePdfFiles(e.dataTransfer.files); });
  input.addEventListener('change', (e) => { if (e.target.files.length) handleMultiplePdfFiles(e.target.files); e.target.value = ''; });
}

async function handleMultiplePdfFiles(files) {
  const dropzone = document.getElementById('pdf-dropzone');
  showLoading(dropzone, true);
  const promises = [];
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf')) continue;
    promises.push(addPdfFile(file));
  }
  await Promise.all(promises);
  showLoading(dropzone, false);
  renderPdfFilesList();
  updatePdfSelector();
}

async function addPdfFile(file) {
  const pdfInfo = { id: Date.now() + Math.random(), name: file.name, file: file, formData: new FormData(), pages: 0, text: '', charCount: 0, pdfDoc: null, snapshots: [], snapshotsReady: false };
  pdfInfo.formData.append('file', file);
  currentPdfFiles.push(pdfInfo);

  try {
    const response = await fetch('/api/pdf/upload', { method: 'POST', body: pdfInfo.formData });
    const result = await response.json();
    if (result.success) { pdfInfo.pages = result.pages; pdfInfo.text = result.text || ''; pdfInfo.charCount = result.charCount; pdfInfo.filename = result.filename; }
  } catch (e) { console.log('Upload error:', e); }

  if (typeof pdfjsLib !== 'undefined') {
    try { const buffer = await file.arrayBuffer(); pdfInfo.pdfDoc = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise; } catch (e) { console.log('PDF.js error:', e); }
  }
  return pdfInfo;
}

function renderPdfFilesList() {
  const container = document.getElementById('pdf-files-list');
  const card = document.getElementById('pdf-files-card');
  document.getElementById('pdf-count').textContent = `(${currentPdfFiles.length})`;

  if (currentPdfFiles.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  container.innerHTML = '';

  currentPdfFiles.forEach((pdf, index) => {
    const item = document.createElement('div');
    item.className = 'pdf-file-item' + (index === currentSelectedPdfIndex ? ' active' : '');
    item.innerHTML = `
      <div class="pdf-file-icon">📄</div>
      <div class="pdf-file-info">
        <div class="pdf-file-name">${escapeHtml(pdf.name)}</div>
        <div class="pdf-file-meta">v${index + 1} | ${pdf.pages} pág. | ${pdf.charCount?.toLocaleString() || 0} chars</div>
        ${pdf.snapshotsReady ? '<div class="pdf-file-snapshots">✓ Snapshots prontos</div>' : ''}
      </div>
      <div class="pdf-file-actions">
        <button class="pdf-file-btn delete" onclick="removePdf(${index})" title="Remover">✕</button>
      </div>
    `;
    item.addEventListener('click', (e) => { if (!e.target.closest('.pdf-file-btn')) selectPdfByIndex(index); });
    container.appendChild(item);
  });

  const allReady = currentPdfFiles.length > 0 && currentPdfFiles.every(p => p.snapshotsReady);
  const btnDownloadZip = document.getElementById('btn-download-all-zip');
  if (btnDownloadZip) btnDownloadZip.disabled = !allReady;
}

function selectPdfByIndex(index) {
  currentSelectedPdfIndex = index;
  renderPdfFilesList();
  updatePdfSelector();
  const pdf = getSelectedPdf();
  if (pdf) populatePdfPageSelector(pdf.pages);
}

function updatePdfSelector() {
  const selector = document.getElementById('pdf-page-selector');
  const pdf = getSelectedPdf();
  if (!selector || !pdf) return;
  const oldVal = selector.value;
  selector.innerHTML = '';
  for (let i = 1; i <= pdf.pages; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Página ${i}`;
    selector.appendChild(opt);
  }
  if (oldVal) selector.value = oldVal;
}

function removePdf(index) {
  currentPdfFiles.splice(index, 1);
  if (currentSelectedPdfIndex >= currentPdfFiles.length) currentSelectedPdfIndex = Math.max(0, currentPdfFiles.length - 1);
  renderPdfFilesList();
  updatePdfSelector();
}

function clearAllPdfs() {
  currentPdfFiles = [];
  currentSelectedPdfIndex = 0;
  renderPdfFilesList();
  showToast('Todos removidos', 'success');
}

async function generateAllSnapshotsInBatch() {
  if (currentPdfFiles.length === 0) { showToast('Nenhum PDF', 'error'); return; }
  if (typeof pdfjsLib === 'undefined') { showToast('PDF.js não carregou. Recarregue.', 'error'); return; }

  const scale = parseInt(document.getElementById('snapshot-scale')?.value) || 2;
  const container = document.getElementById('snapshot-container');
  const progress = document.getElementById('snapshot-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const status = document.getElementById('snapshot-status');

  container.innerHTML = '';
  progress.style.display = 'flex';
  status.textContent = 'Preparando...';

  const totalPages = currentPdfFiles.reduce((sum, p) => sum + (p.pages || 0), 0);
  let processed = 0;

  for (let i = 0; i < currentPdfFiles.length; i++) {
    const pdf = currentPdfFiles[i];
    status.textContent = `Processando ${pdf.name}...`;

    if (!pdf.pdfDoc) {
      try { const buffer = await pdf.file.arrayBuffer(); pdf.pdfDoc = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise; }
      catch (e) { console.log('PDF.js error:', e); }
    }

    if (!pdf.pdfDoc) { showToast(`Erro ao carregar ${pdf.name}`, 'error'); continue; }

    const versionDiv = document.createElement('div');
    versionDiv.className = 'snapshot-version';
    versionDiv.innerHTML = `<div class="snapshot-version-header"><span>${escapeHtml(pdf.name)}</span><span class="badge">v${i + 1}</span></div><div class="snapshot-version-pages" id="pages-${i}"></div>`;
    container.appendChild(versionDiv);

    pdf.snapshots = [];

    for (let j = 1; j <= pdf.pages; j++) {
      try {
        const page = await pdf.pdfDoc.getPage(j);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        pdf.snapshots.push({ pageNum: j, canvas });
        const pagesDiv = document.getElementById(`pages-${i}`);
        const pageDiv = document.createElement('div');
        pageDiv.className = 'snapshot-page';
        pageDiv.appendChild(canvas);
        const label = document.createElement('div');
        label.className = 'snapshot-page-label';
        label.textContent = `Página ${j} de ${pdf.pages}`;
        pageDiv.appendChild(label);
        pagesDiv.appendChild(pageDiv);
      } catch (e) { console.log('Page render error:', e); }

      processed++;
      const pct = totalPages > 0 ? Math.round((processed / totalPages) * 100) : 0;
      progressFill.style.width = pct + '%';
      progressText.textContent = pct + '%';
    }

    pdf.snapshotsReady = true;
    renderPdfFilesList();
  }

  progress.style.display = 'none';
  status.textContent = `${currentPdfFiles.length} PDFs processados (${totalPages} páginas)`;
  showToast(`${totalPages} snapshots gerados!`, 'success');
}

async function downloadCompleteZip() {
  const readyPdfs = currentPdfFiles.filter(p => p.snapshotsReady);
  if (readyPdfs.length === 0) { showToast('Gere os snapshots primeiro', 'error'); return; }

  const status = document.getElementById('snapshot-status');
  status.textContent = 'Criando ZIP...';

  try {
    const zip = new JSZip();
    for (const pdf of readyPdfs) {
      const baseName = pdf.name.replace(/\.pdf$/i, '');
      for (const snap of pdf.snapshots) {
        const dataUrl = snap.canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        zip.file(`${baseName}_pagina-${String(snap.pageNum).padStart(3, '0')}.png`, base64, { base64: true });
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `todos_os_snapshots.zip`;
    a.click();

    status.textContent = 'ZIP baixado!';
    showToast('ZIP completo baixado!', 'success');
  } catch (error) {
    status.textContent = 'Erro ao criar ZIP';
    showToast('Erro: ' + error.message, 'error');
  }
}

async function loadPdfPage(pageNum) {
  const pdf = getSelectedPdf();
  if (!pdf) { showToast('Nenhum PDF', 'error'); return; }
  const page = pageNum || parseInt(document.getElementById('pdf-page-selector')?.value) || 1;
  const formData = new FormData();
  formData.append('file', pdf.file);
  formData.append('page', page.toString());
  try {
    const response = await fetch('/api/pdf/text', { method: 'POST', body: formData });
    const result = await response.json();
    if (result.success) document.getElementById('pdf-text-content').textContent = result.text || 'Nenhum texto';
    else showToast(result.error || 'Erro', 'error');
  } catch (error) { showToast('Erro', 'error'); }
}

async function searchPdf() {
  const pdf = getSelectedPdf();
  if (!pdf) { showToast('Nenhum PDF', 'error'); return; }
  const query = document.getElementById('pdf-search-input').value;
  const caseSensitive = document.getElementById('pdf-case-sensitive').checked;
  if (!query) { showToast('Digite termo', 'error'); return; }
  const formData = new FormData();
  formData.append('file', pdf.file);
  formData.append('query', query);
  formData.append('caseSensitive', caseSensitive.toString());
  try {
    const response = await fetch('/api/pdf/search', { method: 'POST', body: formData });
    const result = await response.json();
    if (result.success) renderSearchResults(result);
    else showToast(result.error, 'error');
  } catch (error) { showToast('Erro', 'error'); }
}

function renderSearchResults(result) {
  const container = document.getElementById('search-results');
  if (!result.matches?.length) { container.innerHTML = '<div class="empty-state"><p>Nenhum resultado</p></div>'; return; }
  container.innerHTML = `<p style="margin-bottom:12px">${result.totalMatches} resultado(s)</p>`;
  result.matches.forEach(m => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.innerHTML = `<span class="highlight">${escapeHtml(m.match)}</span> - ${m.position}<br><small>${escapeHtml(m.context)}</small>`;
    container.appendChild(div);
  });
}

async function extractPdfData() {
  const pdf = getSelectedPdf();
  if (!pdf) { showToast('Nenhum PDF', 'error'); return; }
  const types = [];
  document.querySelectorAll('#pdf-extract .extract-option input:checked').forEach(el => types.push(el.value));
  if (!types.length) { showToast('Selecione tipo', 'error'); return; }
  const formData = new FormData();
  formData.append('file', pdf.file);
  formData.append('types', JSON.stringify(types));
  try {
    const response = await fetch('/api/pdf/extract', { method: 'POST', body: formData });
    const result = await response.json();
    if (result.success) renderExtractedResults(result);
    else showToast(result.error, 'error');
  } catch (error) { showToast('Erro', 'error'); }
}

function renderExtractedResults(result) {
  const container = document.getElementById('extracted-results');
  container.innerHTML = '';
  const labels = { numbers: '🔢 Números', emails: '📧 E-mails', urls: '🔗 URLs', dates: '📅 Datas' };
  let hasData = false;
  Object.entries(labels).forEach(([key, label]) => {
    const data = result[key];
    if (data?.length) {
      hasData = true;
      const section = document.createElement('div');
      section.className = 'extracted-section';
      section.innerHTML = `<h4>${label} <small>(${data.length})</small></h4><div class="extracted-list">${data.map(v => `<span class="extracted-tag">${escapeHtml(typeof v === 'object' ? v.value : v)}</span>`).join('')}</div>`;
      container.appendChild(section);
    }
  });
  if (!hasData) container.innerHTML = '<div class="empty-state"><p>Nenhum dado extraído</p></div>';
}

async function loadPdfSummary() {
  const pdf = getSelectedPdf();
  if (!pdf) { showToast('Nenhum PDF', 'error'); return; }
  const maxLength = parseInt(document.getElementById('summary-length')?.value) || 500;
  const formData = new FormData();
  formData.append('file', pdf.file);
  formData.append('maxLength', maxLength.toString());
  try {
    const response = await fetch('/api/pdf/summary', { method: 'POST', body: formData });
    const result = await response.json();
    if (result.success) document.getElementById('summary-text').textContent = result.summary || 'N/A';
    else showToast(result.error, 'error');
  } catch (error) { showToast('Erro', 'error'); }
}

async function loadPdfStructure() {
  const pdf = getSelectedPdf();
  if (!pdf) { showToast('Nenhum PDF', 'error'); return; }
  try {
    const response = await fetch('/api/pdf/structure', { method: 'POST', body: pdf.formData });
    const result = await response.json();
    if (result.success) renderStructure(result);
    else showToast(result.error, 'error');
  } catch (error) { showToast('Erro', 'error'); }
}

function renderStructure(result) {
  const container = document.getElementById('structure-content');
  container.innerHTML = `
    <div class="structure-section">
      <h4>Visão Geral</h4>
      <div class="structure-list">
        <div class="structure-item"><span>Linhas</span><span>${result.totalLines || 0}</span></div>
        <div class="structure-item"><span>Caracteres</span><span>${result.totalChars?.toLocaleString() || 0}</span></div>
        <div class="structure-item"><span>Cabeçalhos</span><span>${result.headers?.length || 0}</span></div>
        <div class="structure-item"><span>Listas</span><span>${result.lists?.length || 0}</span></div>
      </div>
    </div>
    ${result.headers?.length ? `<div class="structure-section"><h4>Cabeçalhos</h4><div class="structure-list">${result.headers.map(h => `<div class="structure-item"><span>${escapeHtml(h.text)}</span><span class="line-num">L:${h.line}</span></div>`).join('')}</div></div>` : ''}
    ${result.lists?.length ? `<div class="structure-section"><h4>Listas</h4><div class="structure-list">${result.lists.slice(0, 20).map(l => `<div class="structure-item"><span>${escapeHtml(l.text)}</span><span class="line-num">${l.type}</span></div>`).join('')}</div></div>` : ''}
  `;
}

function showLoading(dropzone, show) {
  const loading = dropzone.querySelector('.dropzone-loading');
  const content = dropzone.querySelector('.dropzone-content');
  if (loading && content) { loading.style.display = show ? 'flex' : 'none'; content.style.display = show ? 'none' : 'block'; }
}

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
