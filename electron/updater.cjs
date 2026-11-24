// Atualização OBRIGATÓRIA do app de Windows pelas releases do GitHub (mesmo esquema do VogtSonar Sul).
// Instalado: baixa o instalador novo, avisa e instala em silêncio, reabrindo o app.
// Portátil: não consegue se trocar sozinho, então abre a página de download e fecha.
const { app, dialog, shell } = require('electron');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO = 'cassianovogt123-ai/InvestCrime';
const ASSET = 'InvestCrime-Instalador.exe';
const CHECK_MS = 5 * 60 * 1000;
const build = (v) => Number(String(v).split('.').pop()); // "v1.0.42" -> 42

function request(url, file, redirects = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'InvestCrime', Accept: file ? 'application/octet-stream' : 'application/vnd.github+json' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          return resolve(request(res.headers.location, file, redirects - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        if (!file) {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve(body));
          return;
        }
        const tmp = file + '.part';
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => out.close(() => fs.rename(tmp, file, (e) => (e ? reject(e) : resolve(file)))));
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

let busy = false;

async function check(win) {
  if (busy || !app.isPackaged) return;
  busy = true;
  try {
    const rel = JSON.parse(await request(`https://api.github.com/repos/${REPO}/releases/latest`));
    if (!(build(rel.tag_name) > build(app.getVersion()))) return;
    const label = String(rel.tag_name).replace(/^v/, '');

    if (process.env.PORTABLE_EXECUTABLE_FILE) {
      await dialog.showMessageBox(win, {
        type: 'warning', title: 'InvestCrime', message: `Atualização obrigatória: versão ${label}`,
        detail: 'Esta é a versão portátil. Vou abrir a página para baixar a nova; o app fecha agora.',
        buttons: ['Baixar'],
      });
      shell.openExternal(rel.html_url);
      return app.quit();
    }

    const asset = (rel.assets || []).find((a) => a.name === ASSET);
    if (!asset) return;
    const file = path.join(os.tmpdir(), `InvestCrime-Instalador-${label}.exe`);
    if (!fs.existsSync(file)) await request(asset.browser_download_url, file);
    await dialog.showMessageBox(win, {
      type: 'warning', title: 'InvestCrime', message: `Atualização obrigatória: versão ${label}`,
      detail: 'O app fecha, atualiza e abre de novo sozinho em alguns segundos. Suas hipóteses continuam.',
      buttons: ['Atualizar agora'],
    });
    // /S = instalação silenciosa do NSIS; --force-run reabre o app no fim
    spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    app.quit();
  } catch {
    // sem internet ou GitHub fora: tenta de novo na próxima rodada
  } finally {
    busy = false;
  }
}

function startAutoUpdate(win) {
  setTimeout(() => check(win), 5000);
  setInterval(() => check(win), CHECK_MS);
}

module.exports = { startAutoUpdate };
