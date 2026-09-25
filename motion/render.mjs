// Renders the piece headlessly and pipes frames into ffmpeg.
//   node render.mjs --w 1920 --h 1080 --fps 60 --samples 8 --out out.mp4 [--workers 3]
//   node render.mjs --stills 0.5,2.2,4.6 --w 960 --h 540 --outdir stills
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));
const W = +(args.w || 1920), H = +(args.h || 1080), FPS = +(args.fps || 60);
const SAMPLES = +(args.samples || 8), SHUTTER = +(args.shutter || 0.5);
const WORKERS = +(args.workers || 3);
const DUR = 15;
const root = path.dirname(new URL(import.meta.url).pathname);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

async function worker() {
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[page error]', e));
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.evaluate(([w, h]) => window.setup(w, h), [W, H]);
  return {
    async shot(t, samples) {
      await page.evaluate(([t, f, s, sh]) => window.frame(t, f, s, sh), [t, FPS, samples, SHUTTER]);
      return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
    },
    close: () => browser.close(),
  };
}

if (args.stills) {
  const outdir = path.resolve(args.outdir || 'stills');
  fs.mkdirSync(outdir, { recursive: true });
  const w = await worker();
  for (const ts of String(args.stills).split(',')) {
    const t = +ts;
    const png = await w.shot(t, +(args.samples || 1));
    fs.writeFileSync(path.join(outdir, `t${t.toFixed(2).padStart(5, '0')}.png`), png);
  }
  await w.close();
  server.close();
  process.exit(0);
}

const FF = execSync(`python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"`).toString().trim();
const start = +(args.start || 0), end = +(args.end || DUR * FPS);
const out = path.resolve(args.out || 'master.mp4');
// High-quality H.264 master; tagged BT.709 primaries/matrix with an sRGB transfer so QuickTime shows it exactly as authored.
const ff = spawn(FF, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int', '-c:v', 'libx264', '-preset', 'slow', '-crf', '11', '-tune', 'grain', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709',
  out], { stdio: ['pipe', 'inherit', 'inherit'] });

const workers = await Promise.all(Array.from({ length: WORKERS }, worker));
const done = new Map();
let next = start, written = start;
const t0 = Date.now();
async function flush() {
  while (done.has(written)) {
    const buf = done.get(written); done.delete(written);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    written++;
    if (written % 30 === 0) {
      const el = (Date.now() - t0) / 1000, rate = (written - start) / el;
      console.log(`frame ${written}/${end}  ${rate.toFixed(2)} fps  eta ${((end - written) / rate).toFixed(0)}s`);
    }
  }
}
let flushing = Promise.resolve();
await Promise.all(workers.map(async (w) => {
  while (next < end) {
    const f = next++;
    const buf = await w.shot(f / FPS, SAMPLES);
    done.set(f, buf);
    flushing = flushing.then(flush);
    // keep memory bounded
    while (done.size > 24) await new Promise((r) => setTimeout(r, 20));
  }
}));
await flushing;
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await Promise.all(workers.map((w) => w.close()));
server.close();
console.log('wrote', out, ((Date.now() - t0) / 1000).toFixed(1) + 's');
