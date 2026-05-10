import { useState, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Upload, FileSpreadsheet, FileText, Download, Trash2, Camera, Filter, X,
  ChevronLeft, ChevronRight, Layers, Hash, BarChart3, Plus, Minus, Equal, CheckCircle2, Clock, AlertCircle
} from 'lucide-react'

function hashBuffer(buffer: ArrayBuffer): string {
  const data = new Uint8Array(buffer)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < data.length; i++) {
    h1 = Math.imul(h1 ^ Math.imul(data[i], 2654435761), 597399067)
    h2 = Math.imul(h2 ^ Math.imul(data[i], 1597334677), 3812015801)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 4242875139)
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489911)
  return `${(h1 ^ h2) >>> 0}`
}

function Toast({ message, type }: { message: string; type: 'success' | 'error' | '' }) {
  if (!message) return null
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, background: type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#1f2937',
      color: 'white', padding: '12px 20px', borderRadius: 8, zIndex: 1000, opacity: 1, transition: 'all 0.3s'
    }}>
      {message}
    </div>
  )
}

type SnapshotStatus = { id: string; page: number; status: string; image_url: string | null; created_at: string }

type PdfEntry = {
  name: string; file: File; pages: number; pdfDoc: any;
  pdf_hash: string; scale: number;
  existingSnapshots: SnapshotStatus[]; // snapshots já no banco
  localSnapshots: { num: number; canvas: HTMLCanvasElement }[]; // snapshots gerados nesta sessão
}

export default function Dashboard() {
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState('')
  const toast = useCallback((msg: string, type: 'success' | 'error' | '' = '') => {
    setToastMsg(msg)
    setToastType(type)
    setTimeout(() => setToastMsg(''), 3000)
  }, [])

  const [ssFile, setSsFile] = useState<File | null>(null)
  const [ssData, setSsData] = useState<any>(null)
  const [sheets, setSheets] = useState<any[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [ssPage, setSsPage] = useState(1)
  const [ssTotalPages, setSsTotalPages] = useState(1)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [aggGroup, setAggGroup] = useState('')
  const [aggField, setAggField] = useState('')
  const [aggOp, setAggOp] = useState('sum')
  const [aggData, setAggData] = useState<any[]>([])

  const [pdfFiles, setPdfFiles] = useState<PdfEntry[]>([])
  const [scale, setScale] = useState(2)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [activeTab, setActiveTab] = useState('spreadsheet')

  const handleSpreadsheet = useCallback(async (file: File) => {
    setSsFile(file)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const [uploadRes, previewRes] = await Promise.all([
        fetch('/api/spreadsheet/upload', { method: 'POST', body: formData }),
        fetch('/api/spreadsheet/preview', { method: 'POST', body: formData }),
      ])
      const upload = await uploadRes.json()
      const preview = await previewRes.json()
      setSheets(upload.sheets || [])
      setSsData(preview)
      setSelectedSheet(preview.filename || '')
      setSsTotalPages(Math.ceil(preview.totalRows / 50))
      setSsPage(1)
      if (preview.headers?.length) {
        setAggGroup(preview.headers[0])
        setAggField(preview.headers[0])
      }
      toast('Arquivo carregado!', 'success')
    } catch (e: any) {
      toast('Erro: ' + e.message, 'error')
    }
  }, [])

  const handlePdfFiles = useCallback(async (files: FileList) => {
    const newPdfs: PdfEntry[] = []
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) continue

      const buffer = await file.arrayBuffer()
      const hash = hashBuffer(buffer)

      let pdfDoc: any = null
      try {
        pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise
      } catch (e) {}

      let pages = 0
      let existingSnapshots: SnapshotStatus[] = []
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('scale', String(scale))
        const res = await fetch('/api/pdf/snapshots', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.success) {
          pages = data.pages || 0
          existingSnapshots = data.snapshots || []
        }
      } catch (e) {}

      newPdfs.push({
        name: file.name, file, pages, pdfDoc, pdf_hash: hash, scale,
        existingSnapshots, localSnapshots: [],
      })
    }
    setPdfFiles(prev => [...prev, ...newPdfs])
    toast(`${newPdfs.length} PDF(s) carregado(s)`, 'success')
  }, [scale])

  const generateAllSnapshots = useCallback(async () => {
    if (pdfFiles.length === 0) return
    setGenerating(true)
    setProgress(0)

    // Calcula páginas restantes (não-geradas)
    const allPending: { pdf: PdfEntry; pageNum: number }[] = []
    for (const pdf of pdfFiles) {
      for (let j = 1; j <= pdf.pages; j++) {
        const done = pdf.existingSnapshots.find(s => s.page === j && s.status === 'done')
        const localDone = pdf.localSnapshots.find(s => s.num === j)
        if (!done && !localDone) {
          allPending.push({ pdf, pageNum: j })
        }
      }
    }

    const total = allPending.length
    let done = 0
    const updatedPdfs: PdfEntry[] = []

    for (const pdf of pdfFiles) {
      let p = pdf
      if (!p.pdfDoc) {
        try {
          const buf = await p.file.arrayBuffer()
          p = { ...p, pdfDoc: await pdfjsLib.getDocument({ data: buf }).promise }
        } catch (e) { updatedPdfs.push(p); continue }
      }
      if (!p.pdfDoc) { updatedPdfs.push(p); continue }

      const newSnaps: { num: number; canvas: HTMLCanvasElement }[] = [...p.localSnapshots]

      for (let j = 1; j <= p.pages; j++) {
        const alreadyDone = p.existingSnapshots.find(s => s.page === j && s.status === 'done')
        const localDone = newSnaps.find(s => s.num === j)
        if (alreadyDone || localDone) continue

        const page = await p.pdfDoc.getPage(j)
        const vp = page.getViewport({ scale: p.scale })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width
        canvas.height = vp.height
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        newSnaps.push({ num: j, canvas })
        done++
        if (total > 0) setProgress(Math.round((done / total) * 100))
      }

      updatedPdfs.push({ ...p, localSnapshots: newSnaps })
    }

    setPdfFiles(updatedPdfs)
    setGenerating(false)
    toast(`${done} snapshot(s) gerado(s) — ${updatedPdfs.reduce((s, p) => s + p.localSnapshots.length, 0)} total nesta sessão`, 'success')
  }, [pdfFiles, scale])

  const isPdfReady = (pdf: PdfEntry) => {
    const totalPages = pdf.pages
    const doneExisting = pdf.existingSnapshots.filter(s => s.status === 'done').length
    const doneLocal = pdf.localSnapshots.length
    return doneExisting + doneLocal === totalPages && totalPages > 0
  }

  const getPageStatus = (pdf: PdfEntry, pageNum: number): 'done' | 'local' | 'pending' => {
    if (pdf.existingSnapshots.find(s => s.page === pageNum && s.status === 'done')) return 'done'
    if (pdf.localSnapshots.find(s => s.num === pageNum)) return 'local'
    return 'pending'
  }

  const downloadZip = useCallback(async () => {
    const ready = pdfFiles.filter(isPdfReady)
    if (!ready.length) return
    const zip = new JSZip()
    for (const pdf of ready) {
      const base = pdf.name.replace(/\.pdf$/i, '')
      for (const snap of pdf.localSnapshots) {
        const data = snap.canvas.toDataURL('image/png').split(',')[1]
        zip.file(`${base}_p${String(snap.num).padStart(3, '0')}.png`, data, { base64: true })
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'snapshots.zip'
    a.click()
    toast('ZIP baixado!', 'success')
  }, [pdfFiles])

  const downloadPdf = useCallback(async () => {
    const ready = pdfFiles.filter(isPdfReady)
    if (!ready.length) return
    toast('Gerando PDF...', '')
    const { PDFDocument, rgb, StandardFonts } = PDFLib
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    for (let i = 0; i < ready.length; i++) {
      const pdf = ready[i]
      const base = pdf.name.replace(/\.pdf$/i, '')
      const vl = `v${i + 1}: ${base}`
      for (const snap of pdf.localSnapshots) {
        const imgData = snap.canvas.toDataURL('image/png')
        const bytes = Uint8Array.from(atob(imgData.split(',')[1]), c => c.charCodeAt(0))
        const image = await pdfDoc.embedPng(bytes)
        const headerH = 50, footerH = 30
        const pw = image.width, ph = image.height + headerH + footerH
        const page = pdfDoc.addPage([pw, ph])
        page.drawRectangle({ x: 0, y: ph - headerH, width: pw, height: headerH, color: rgb(0.2, 0.2, 0.35) })
        page.drawText(vl, { x: 15, y: ph - 32, size: 12, font, color: rgb(1, 1, 1) })
        page.drawText(`Página ${snap.num} de ${pdf.localSnapshots.length}`, { x: 15, y: ph - 48, size: 9, font, color: rgb(0.8, 0.8, 0.8) })
        page.drawImage(image, { x: 0, y: footerH, width: image.width, height: image.height })
        page.drawRectangle({ x: 0, y: 0, width: pw, height: footerH, color: rgb(0.93, 0.93, 0.93), opacity: 0.9 })
        page.drawText(`${base} - Página ${snap.num}`, { x: 15, y: 10, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
      }
    }
    const bytes = await pdfDoc.save()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    a.download = 'snapshots_consolidado.pdf'
    a.click()
    toast('PDF baixado!', 'success')
  }, [pdfFiles])

  const allReady = pdfFiles.length > 0 && pdfFiles.every(isPdfReady)

  const changePage = useCallback(async (page: number) => {
    if (!ssFile) return
    const formData = new FormData()
    formData.append('file', ssFile)
    const activeFilters: Record<string, { operator: string; value: string }> = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) activeFilters[k] = { operator: 'contains', value: v } })
    try {
      const res = await fetch('/api/spreadsheet/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: activeFilters, page, limit: 50, sheet: selectedSheet }),
      })
      const data = await res.json()
      if (data.success) {
        setSsData(data)
        setSsPage(page)
        setSsTotalPages(Math.ceil(data.pagination?.total / 50) || 1)
      }
    } catch (e: any) { toast('Erro: ' + e.message, 'error') }
  }, [ssFile, filters, selectedSheet])

  const runAggregation = useCallback(async () => {
    if (!ssFile || !aggGroup || !aggField) return
    const formData = new FormData()
    formData.append('file', ssFile)
    try {
      const res = await fetch('/api/spreadsheet/aggregate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupBy: aggGroup, aggregations: [{ field: aggField, operation: aggOp, as: aggField }], sheet: selectedSheet }),
      })
      const data = await res.json()
      if (data.success) setAggData(data.data || [])
    } catch (e: any) { toast('Erro: ' + e.message, 'error') }
  }, [ssFile, aggGroup, aggField, aggOp, selectedSheet])

  const exportData = useCallback(async (format: 'csv' | 'xlsx') => {
    if (!ssFile) return
    const res = await fetch('/api/spreadsheet/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 1, limit: 10000, sheet: selectedSheet }),
    })
    const data = await res.json()
    if (data.success) {
      const er = await fetch('/api/spreadsheet/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: data.data, filename: 'export', format }),
      })
      const blob = await er.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `export.${format}`
      a.click()
      toast('Exportado!', 'success')
    }
  }, [ssFile, selectedSheet])

  const getPageIcon = (status: 'done' | 'local' | 'pending') => {
    if (status === 'done') return <CheckCircle2 className="w-3 h-3 text-emerald-500" />
    if (status === 'local') return <CheckCircle2 className="w-3 h-3 text-blue-500" />
    return <Clock className="w-3 h-3 text-slate-400" />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Toast message={toastMsg} type={toastType as any} />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📊</span>
              <span className="font-bold text-lg text-slate-800 tracking-tight">Data Dashboard</span>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
              <TabsList className="bg-slate-100">
                <TabsTrigger value="spreadsheet" className="gap-2"><FileSpreadsheet className="w-4 h-4" /> Planilhas</TabsTrigger>
                <TabsTrigger value="pdf" className="gap-2"><FileText className="w-4 h-4" /> PDF</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="spreadsheet" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleSpreadsheet(e.dataTransfer.files[0]) }} onClick={() => document.getElementById('ss-upload')?.click()}>
                  <input id="ss-upload" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleSpreadsheet(e.target.files[0]) }} />
                  <Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                  <p className="text-lg font-semibold text-slate-700">Arraste planilhas aqui</p>
                  <p className="text-sm text-slate-500 mt-1">.xlsx .xls .csv</p>
                </div>
              </CardContent>
            </Card>

            {ssData && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Card className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white border-0"><CardContent className="p-5"><p className="text-sm opacity-80">Total Linhas</p><p className="text-3xl font-bold mt-1">{ssData.totalRows.toLocaleString()}</p></CardContent></Card>
                  <Card className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white border-0"><CardContent className="p-5"><p className="text-sm opacity-80">Colunas</p><p className="text-3xl font-bold mt-1">{ssData.headers?.length || 0}</p></CardContent></Card>
                  <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0"><CardContent className="p-5"><p className="text-sm opacity-80">Formato</p><p className="text-3xl font-bold mt-1">{ssData.filename?.split('.').pop().toUpperCase() || 'N/A'}</p></CardContent></Card>
                </div>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> Dados</CardTitle>
                      <div className="flex items-center gap-2">
                        {sheets.length > 1 && <Select value={selectedSheet} onValueChange={setSelectedSheet}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{sheets.map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}</SelectContent></Select>}
                        <Button size="sm" variant="outline" onClick={() => exportData('csv')}><Download className="w-4 h-4 mr-1" /> CSV</Button>
                        <Button size="sm" variant="outline" onClick={() => exportData('xlsx')}><Download className="w-4 h-4 mr-1" /> XLSX</Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap p-3 bg-slate-50 rounded-lg">
                      <Filter className="w-4 h-4 text-slate-500" />
                      {ssData.headers?.slice(0, 4).map((h: string) => (
                        <div key={h} className="flex items-center gap-2">
                          <Label className="text-xs text-slate-500">{h}</Label>
                          <Input className="w-32 h-8 text-sm" placeholder="Filtro..." value={filters[h] || ''} onChange={e => setFilters(prev => ({ ...prev, [h]: e.target.value }))} />
                        </div>
                      ))}
                      <Button size="sm" onClick={() => changePage(1)}>Aplicar</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setFilters({}); changePage(1) }}><X className="w-4 h-4" /></Button>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-100"><TableRow>{ssData.headers?.map((h: string) => <TableHead key={h} className="font-semibold">{h}</TableHead>)}</TableRow></TableHeader>
                        <TableBody>{ssData.data?.map((row: any, i: number) => <TableRow key={i} className="hover:bg-slate-50">{ssData.headers?.map((h: string) => <TableCell key={h} className="text-sm">{row[h] ?? ''}</TableCell>)}</TableRow>)}</TableBody>
                      </Table>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => changePage(ssPage - 1)} disabled={ssPage <= 1}><ChevronLeft className="w-4 h-4" /></Button>
                      <span className="text-sm text-slate-600 px-3">Página {ssPage} de {ssTotalPages}</span>
                      <Button variant="outline" size="sm" onClick={() => changePage(ssPage + 1)} disabled={ssPage >= ssTotalPages}><ChevronRight className="w-4 h-4" /></Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Agrupamento</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-3 flex-wrap mb-4">
                      <div className="flex flex-col gap-1"><Label className="text-xs">Agrupar por</Label><Select value={aggGroup} onValueChange={setAggGroup}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{ssData.headers?.map((h: string) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent></Select></div>
                      <div className="flex flex-col gap-1"><Label className="text-xs">Campo numérico</Label><Select value={aggField} onValueChange={setAggField}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{ssData.headers?.map((h: string) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent></Select></div>
                      <div className="flex flex-col gap-1"><Label className="text-xs">Operação</Label><Select value={aggOp} onValueChange={setAggOp}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sum"><span className="flex items-center gap-1"><Plus className="w-3 h-3" /> Soma</span></SelectItem><SelectItem value="avg"><span className="flex items-center gap-1"><Equal className="w-3 h-3" /> Média</span></SelectItem><SelectItem value="min"><span className="flex items-center gap-1"><Minus className="w-3 h-3" /> Mínimo</span></SelectItem><SelectItem value="max"><span className="flex items-center gap-1"><Hash className="w-3 h-3" /> Máximo</span></SelectItem><SelectItem value="count"><span className="flex items-center gap-1"><Layers className="w-3 h-3" /> Contagem</span></SelectItem></SelectContent></Select></div>
                      <Button onClick={runAggregation}>Executar</Button>
                    </div>
                    {aggData.length > 0 && <div className="border rounded-lg overflow-hidden"><Table><TableHeader className="bg-slate-100"><TableRow>{Object.keys(aggData[0]).map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{aggData.map((row: any, i: number) => <TableRow key={i}>{Object.values(row).map((v: any, j: number) => <TableCell key={j}>{String(v)}</TableCell>)}</TableRow>)}</TableBody></Table></div>}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="pdf" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handlePdfFiles(e.dataTransfer.files) }} onClick={() => document.getElementById('pdf-upload')?.click()}>
                  <input id="pdf-upload" type="file" accept=".pdf" multiple className="hidden" onChange={e => { if (e.target.files?.length) handlePdfFiles(e.target.files) }} />
                  <FileText className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                  <p className="text-lg font-semibold text-slate-700">Arraste PDFs aqui</p>
                  <p className="text-sm text-slate-500 mt-1">múltiplos arquivos • .pdf • snapshots reutilizados do banco</p>
                </div>
              </CardContent>
            </Card>

            {pdfFiles.length > 0 && (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-2"><CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5" /> PDFs Carregados</CardTitle><Badge variant="secondary">{pdfFiles.length}</Badge></div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select value={String(scale)} onValueChange={v => setScale(Number(v))}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1x</SelectItem><SelectItem value="2">2x</SelectItem><SelectItem value="3">3x</SelectItem></SelectContent></Select>
                        <Button onClick={generateAllSnapshots} disabled={generating} className="gap-2"><Camera className="w-4 h-4" /> {generating ? `Gerando ${progress}%...` : 'Gerar Snapshots'}</Button>
                        <Button variant="outline" onClick={downloadZip} disabled={!allReady} className="gap-2"><Download className="w-4 h-4" /> ZIP</Button>
                        <Button variant="outline" onClick={downloadPdf} disabled={!allReady} className="gap-2"><FileText className="w-4 h-4" /> PDF</Button>
                        <Button variant="destructive" size="icon" onClick={() => { setPdfFiles([]); toast('Limpo!', 'success') }}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {generating && <div className="mb-4"><div className="flex justify-between text-sm mb-1"><span>Progresso</span><span>{progress}%</span></div><Progress value={progress} className="h-2" /></div>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {pdfFiles.map((pdf: PdfEntry, i: number) => {
                        const doneExisting = pdf.existingSnapshots.filter(s => s.status === 'done').length
                        const doneLocal = pdf.localSnapshots.length
                        const total = pdf.pages
                        const ready = isPdfReady(pdf)
                        const pending = total - doneExisting - doneLocal
                        return (
                          <div key={i} className={`p-3 rounded-lg border ${ready ? 'border-emerald-300 bg-emerald-50' : 'bg-slate-50'}`}>
                            <div className="flex items-start gap-3">
                              <FileText className={`w-8 h-8 flex-shrink-0 mt-1 ${ready ? 'text-emerald-500' : 'text-red-500'}`} />
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm truncate">{pdf.name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">v{i + 1} • {pdf.pages} pág.</p>
                                {doneExisting > 0 && <p className="text-xs text-blue-600 mt-1 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {doneExisting} do banco</p>}
                                {doneLocal > 0 && <p className="text-xs text-indigo-600 mt-1 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {doneLocal} locais</p>}
                                {pending > 0 && <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {pending} pendentes</p>}
                                {ready && <p className="text-xs text-emerald-600 mt-1 font-medium">✓ Prontos: {total}</p>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {pdfFiles.some((p: PdfEntry) => p.localSnapshots.length > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Camera className="w-5 h-5" /> Snapshots desta Sessão
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        {pdfFiles.filter((p: PdfEntry) => p.localSnapshots.length > 0).map((pdf: PdfEntry, pi: number) => (
                          <div key={pi} className="border rounded-xl overflow-hidden">
                            <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between">
                              <span className="font-semibold">v{pi + 1}: {pdf.name}</span>
                              <Badge className="bg-white/20 text-white border-0">{pdf.localSnapshots.length} pág.</Badge>
                            </div>
                            <div className="p-4 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {pdf.localSnapshots.map((snap: any) => (
                                <div key={snap.num} className="bg-white rounded-lg overflow-hidden shadow-sm">
                                  <canvas ref={(canvas: any) => { if (canvas && snap.canvas) { const ctx = canvas.getContext('2d'); canvas.width = snap.canvas.width; canvas.height = snap.canvas.height; ctx?.drawImage(snap.canvas, 0, 0); } }} className="w-full" />
                                  <div className="p-2 text-center text-xs text-slate-500 bg-slate-100 flex items-center justify-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    Página {snap.num} de {pdf.localSnapshots.length}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 mt-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-slate-500">Data Dashboard v1.0 — Planilhas e PDFs</div>
      </footer>
    </div>
  )
}
