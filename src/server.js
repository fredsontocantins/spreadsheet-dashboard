import express from 'express';
import cors from 'cors';
import multer from 'multer';
import spreadsheetRoutes from './routes/spreadsheet.routes.js';
import pdfRoutes from './routes/pdf.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use('/api/spreadsheet', upload.single('file'), spreadsheetRoutes);
app.use('/api/pdf', upload.single('file'), pdfRoutes);

app.get('/api/health', (req, res) => res.json({ 
  status: 'ok', 
  timestamp: new Date().toISOString(),
  services: ['spreadsheet', 'pdf']
}));

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║       📊 Data Dashboard Server             ║
╠══════════════════════════════════════════════╣
║  🌐 http://localhost:${PORT}                  ║
║  📁 Upload: Planilhas + PDFs                ║
║  🔧 API: /api/spreadsheet | /api/pdf        ║
╚══════════════════════════════════════════════╝
  `);
});