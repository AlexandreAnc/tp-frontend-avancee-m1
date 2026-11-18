/**
 * Images de la PWA, générées avec le Chromium de Playwright (aucun outil d'image à installer) :
 * - `icons` : icônes « maskable », icône iOS et icônes des raccourcis, à partir de `public/icon.svg` et des pictogrammes de l'app ;
 * - `screenshots` : captures de l'app réelle pour la fenêtre d'installation (manifeste `screenshots`), en WebP.
 *
 *   pnpm exec tsx scripts/pwa-assets.ts icons
 *   PWA_BASE_URL=http://localhost:3100 pnpm exec tsx scripts/pwa-assets.ts screenshots
 *
 * Les captures créent un compte de démonstration : uniquement contre un serveur local, jamais la prod.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const BRAND = '#4f46e5';

async function render(browser: Browser, html: string, size: number): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
  const image = await page.screenshot({ type: 'png' });
  await page.close();
  return image;
}

/** Pictogramme de `icon.svg` (tout sauf le fond), recentré en (32, 32) et réduit de `scale`, sur un fond plein. */
async function fullBleedIcon(scale: number, size: number): Promise<string> {
  const source = await readFile(`${PUBLIC_DIR}icon.svg`, 'utf8');
  const glyph = source.replace(/<\?xml[^>]*>/, '').replace(/<svg[^>]*>|<\/svg>/g, '').replace(/<rect[^>]*\/>/, '');
  // Boîte du pictogramme : x 16,5 → 47,5 ; y 14,5 → 52,5 (centre 32 ; 33,5).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" style="display:block">
    <rect width="64" height="64" fill="${BRAND}"/>
    <g transform="translate(32 32) scale(${scale}) translate(-32 -33.5)">${glyph}</g>
  </svg>`;
}

async function shortcutIcon(name: string, size: number): Promise<string> {
  const svg = await readFile(`${PUBLIC_DIR}icons/ui/${name}.svg`);
  const mask = `url(data:image/svg+xml;base64,${svg.toString('base64')}) center / contain no-repeat`;
  return `<div style="width:${size}px;height:${size}px;background:${BRAND};display:grid;place-items:center">
    <div style="width:${size * 0.46}px;height:${size * 0.46}px;background:#fff;-webkit-mask:${mask};mask:${mask}"></div>
  </div>`;
}

async function icons(browser: Browser) {
  // Zone sûre d'une icône maskable : cercle de 80 % ; le pictogramme réduit à 80 % y tient avec de la marge (rayon ≈ 31 %).
  for (const size of [192, 512]) {
    await writeFile(`${PUBLIC_DIR}icons/maskable-${size}.png`, await render(browser, await fullBleedIcon(0.8, size), size));
  }
  // iOS arrondit lui-même les coins et refuse la transparence : fond plein, pictogramme un peu plus grand.
  await writeFile(`${PUBLIC_DIR}icons/apple-touch-icon.png`, await render(browser, await fullBleedIcon(0.9, 180), 180));
  const shortcuts = { chat: 'comments-solid', drive: 'folder-solid', maison: 'lightbulb', planning: 'calendar' };
  for (const [name, glyph] of Object.entries(shortcuts)) {
    await writeFile(`${PUBLIC_DIR}icons/shortcut-${name}.png`, await render(browser, await shortcutIcon(glyph, 96), 96));
  }
}

/** PDF d'une page minimal mais valide (le serveur vérifie le type par le contenu). */
function samplePdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

async function capture(page: Page, path: string, file: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  const png = await page.screenshot({ type: 'png' });
  // Encodage WebP par le navigateur lui-même (canvas), pour des fichiers légers.
  const webp = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: image.naturalWidth, height: image.naturalHeight });
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', 0.8);
  }, `data:image/png;base64,${png.toString('base64')}`);
  await writeFile(`${PUBLIC_DIR}screenshots/${file}`, Buffer.from(webp.split(',')[1]!, 'base64'));
}

async function screenshots(browser: Browser) {
  const baseURL = process.env.PWA_BASE_URL ?? 'http://localhost:3100';
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseURL)) throw new Error('Captures uniquement contre un serveur local (crée un compte).');
  await mkdir(`${PUBLIC_DIR}screenshots`, { recursive: true });

  const options = { baseURL, locale: 'fr-FR', colorScheme: 'light' as const, serviceWorkers: 'block' as const };
  const mobile: BrowserContext = await browser.newContext({ ...options, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const headers = { origin: baseURL };
  const signUp = await mobile.request.post('/api/auth/sign-up/email', {
    headers, data: { name: 'Camille Martin', email: `camille.martin.${randomUUID().slice(0, 8)}@example.com`, password: 'mot-de-passe-demo-1234' },
  });
  if (!signUp.ok()) throw new Error(`Inscription refusée : ${signUp.status()}`);
  const documents = ['Facture EDF novembre', 'Contrat assurance habitation', 'Bulletin de salaire octobre', 'Devis plombier', 'Avis taxe fonciere'];
  for (const name of documents) {
    await mobile.request.post('/api/files', {
      headers: { ...headers, 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(`${name.replaceAll(' ', '-')}.pdf`) },
      data: samplePdf(name),
    });
  }

  const page = await mobile.newPage();
  await capture(page, '/panel', 'panel-narrow.webp');
  await capture(page, '/drive', 'drive-narrow.webp');

  const desktop = await browser.newContext({ ...options, viewport: { width: 1280, height: 800 }, storageState: await mobile.storageState() });
  await capture(await desktop.newPage(), '/drive', 'drive-wide.webp');
}

const task = process.argv[2];
const browser = await chromium.launch();
try {
  if (task === 'icons') await icons(browser);
  else if (task === 'screenshots') await screenshots(browser);
  else throw new Error('Usage : pwa-assets.ts icons | screenshots');
} finally {
  await browser.close();
}
