import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

execSync('npx vite build', { stdio: 'inherit' });

const html = readFileSync('dist/index.html', 'utf8');
const css = readFileSync('dist/assets/' + html.match(/assets\/index-\w+\.css/)?.[0], 'utf8');
const js = readFileSync('dist/assets/' + html.match(/assets\/index-\w+\.js/)?.[0], 'utf8');

const bundle = html
  .replace('<link rel="stylesheet" crossorigin href="/assets/index-C3jMnVDL.css">', '')
  .replace('<script type="module" crossorigin src="/assets/index-CXTHJAGn.js"></script>', '')
  .replace('</body>', `
    <style>${css}</style>
    <script type="module">${js}</script>
  </body>`)
  .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>', '')
  .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>', '')
  .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>', '')
  .replace('<script>\n      pdfjsLib.GlobalWorkerOptions.workerSrc = ', '<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>\n    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>\n    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>\n    <script>\n      pdfjsLib.GlobalWorkerOptions.workerSrc = ');

writeFileSync('public/index.html', bundle);
console.log('✅ Bundle created!');
