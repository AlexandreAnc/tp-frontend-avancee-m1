/**
 * Compare la même page d'article rendue en CSR, SSR et SSG (`/rendu/<mode>/<slug>`).
 * 1. Temps serveur : 30 requêtes par mode, médiane du TTFB et taille du HTML (curl côté Node).
 * 2. Web Vitals : 3 passages Lighthouse mobile par mode, médiane de chaque métrique.
 *    Ralentissement réellement appliqué au réseau et au processeur (`devtools`) : la simulation par défaut de Lighthouse
 *    (`simulate`) estime le chargement à partir d'un chargement rapide et gommait l'écart entre CSR et SSG (2,9 s contre 2,9 s,
 *    alors que le CSR met réellement 5,4 s à afficher l'article contre 1,8 s). `THROTTLING=simulate` pour comparer.
 * Une quatrième ligne mesure l'article du site public : SSG servi sans JavaScript.
 *
 *   node scripts/compare-rendering.mjs http://localhost:3000 [slug]
 *
 * Écrit le tableau Markdown sur la sortie standard (repris dans docs/RENDU.md).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const SLUG = process.argv[3] ?? 'assistant-ia-personnel-guide';
const THROTTLING = process.env.THROTTLING ?? 'devtools';
const PAGES = [
  { label: 'CSR', path: `/rendu/csr/${SLUG}` },
  { label: 'SSR', path: `/rendu/ssr/${SLUG}` },
  { label: 'SSG', path: `/rendu/ssg/${SLUG}` },
  { label: 'SSG sans JS (site public)', path: `/blog/${SLUG}` },
];
const REQUESTS = 30;
const RUNS = 3;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Une connexion gardée ouverte pendant un passage Lighthouse peut avoir été fermée par le serveur : on réessaie. */
async function fetchFresh(url) {
  try {
    return await fetch(url, { headers: { 'accept-encoding': 'br' } });
  } catch {
    return fetch(url, { headers: { 'accept-encoding': 'br' } });
  }
}

async function serverTiming(url) {
  const ttfb = [];
  let html = '';
  for (let index = 0; index < REQUESTS; index++) {
    const started = performance.now();
    const response = await fetchFresh(url);
    const reader = response.body.getReader();
    const first = await reader.read();
    ttfb.push(performance.now() - started);
    const chunks = [first.value];
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) chunks.push(chunk.value);
    html = Buffer.concat(chunks.filter(Boolean)).toString();
  }
  return { ttfb: median(ttfb), htmlBytes: Buffer.byteLength(html), titleInHtml: /<h1[^>]*>[^<]+/.test(html) };
}

function lighthouse(url, outDir, run) {
  const output = join(outDir, `${run}.json`);
  execFileSync('npx', ['-y', 'lighthouse@12', url, '--quiet', '--form-factor=mobile', '--only-categories=performance',
    `--throttling-method=${THROTTLING}`, '--chrome-flags=--headless=new', '--output=json', `--output-path=${output}`], { stdio: 'ignore' });
  const report = JSON.parse(readFileSync(output, 'utf8'));
  const value = (id) => report.audits[id].numericValue;
  const scripts = report.audits['network-requests'].details.items.filter((item) => item.resourceType === 'Script');
  return {
    score: report.categories.performance.score * 100,
    fcp: value('first-contentful-paint'),
    lcp: value('largest-contentful-paint'),
    tbt: value('total-blocking-time'),
    cls: value('cumulative-layout-shift'),
    si: value('speed-index'),
    tti: value('interactive'),
    jsKb: scripts.reduce((total, item) => total + item.transferSize, 0) / 1024,
  };
}

const rows = [];
for (const page of PAGES) {
  const url = `${BASE}${page.path}`;
  process.stderr.write(`${page.label} : temps serveur… `);
  const server = await serverTiming(url);
  process.stderr.write('Lighthouse… ');
  const outDir = mkdtempSync(join(tmpdir(), 'lh-rendering-'));
  const runs = Array.from({ length: RUNS }, (_, run) => lighthouse(url, outDir, run));
  const pick = (key) => median(runs.map((result) => result[key]));
  rows.push({ label: page.label, ...server, score: pick('score'), fcp: pick('fcp'), lcp: pick('lcp'), tbt: pick('tbt'), cls: pick('cls'), si: pick('si'), tti: pick('tti'), jsKb: pick('jsKb') });
  process.stderr.write('ok\n');
}

const s = (ms) => `${(ms / 1000).toFixed(2)} s`;
console.info(`Article « ${SLUG} » · ${REQUESTS} requêtes (TTFB) et ${RUNS} passages Lighthouse mobile (ralentissement : ${THROTTLING}) par mode, médianes.\n`);
console.info('| Mode | TTFB serveur | HTML | Contenu dans le HTML | JS | FCP | LCP | Speed Index | TBT | CLS | Interactive | Score perf. |');
console.info('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const row of rows) {
  console.info(`| **${row.label}** | ${row.ttfb.toFixed(1)} ms | ${(row.htmlBytes / 1024).toFixed(1)} Ko | ${row.titleInHtml ? 'oui' : 'non'} | ${row.jsKb.toFixed(0)} Ko | ${s(row.fcp)} | ${s(row.lcp)} | ${s(row.si)} | ${Math.round(row.tbt)} ms | ${row.cls.toFixed(3)} | ${s(row.tti)} | ${Math.round(row.score)} |`);
}
