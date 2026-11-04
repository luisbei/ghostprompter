const {
  app, BrowserWindow, ipcMain: electronIpc, desktopCapturer, globalShortcut,
  dialog, shell, session, screen, protocol, net, Menu, powerMonitor,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { pathToFileURL } = require('url');
const crypto = require('crypto');
const I18N = require('./src/i18n');
const t = I18N.t;
const { spawn, spawnSync } = require('child_process');

// ================================================================ PRIVACIDADE: NADA SAI DO COMPUTADOR
// Gravações de tela, câmera e microfone, roteiros e configurações são gravados só no disco local.
// Além de o app não ter nenhuma função de envio, a rede é TRAVADA aqui no código:
//  1) processo principal: fetch/http/https/net só podem acessar os endereços de ALLOWED_HOSTS
//     (apenas o download dos modelos de voz, iniciado pelo usuário);
//  2) janelas: toda requisição que não seja local (arquivos do app, modelos, vídeo da câmera/tela) é cancelada;
//  3) serviços de fundo do Chromium que poderiam acessar a internet são desligados.
const ALLOWED_HOSTS = new Set(['alphacephei.com']);
const blockedRequests = []; // registro das tentativas bloqueadas (para diagnóstico e testes)

function checkUrl(u) {
  let url;
  try { url = new URL(String(u)); } catch { url = null; }
  if (!url || url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    const what = url ? url.protocol + '//' + url.hostname : String(u).slice(0, 80);
    blockedRequests.push(what);
    throw new Error('acesso à rede bloqueado: ' + what);
  }
}
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    try { checkUrl(typeof input === 'string' || input instanceof URL ? input : input.url); } catch (e) { return Promise.reject(e); }
    return realFetch(input, { ...init, redirect: 'error' }); // redirecionamento poderia levar a outro endereço
  };
  // http/https: confere a URL E as opções (que podem trocar o host: http.request(url, { host: 'outro' }))
  for (const [mod, proto] of [[require('http'), 'http:'], [require('https'), 'https:']]) {
    for (const fn of ['request', 'get']) {
      const orig = mod[fn];
      mod[fn] = function guarded(target, ...rest) {
        const opts = Object.assign({}, typeof target === 'object' && !(target instanceof URL) ? target : {},
          rest[0] && typeof rest[0] === 'object' ? rest[0] : {});
        if (typeof target === 'string' || target instanceof URL) checkUrl(target);
        if (opts.hostname || opts.host || typeof target === 'object') {
          checkUrl(`${opts.protocol || proto}//${opts.hostname || opts.host || 'localhost'}`);
        }
        return orig.call(this, target, ...rest);
      };
    }
  }
  // conexões de baixo nível (net/tls/http2) só para os hosts permitidos; UDP (dgram) proibido
  const hostOf = (args) => {
    const a = args[0];
    if (a && typeof a === 'object') return a.path ? null : (a.host || a.hostname || 'localhost'); // path = pipe local
    if (typeof a === 'number') return typeof args[1] === 'string' ? args[1] : 'localhost';
    return null; // string = caminho de pipe local
  };
  const guardSocket = (mod, fns) => {
    for (const fn of fns) {
      const orig = mod[fn];
      mod[fn] = function guardedSocket(...args) {
        const host = hostOf(args);
        if (host !== null) checkUrl('https://' + host);
        return orig.apply(this, args);
      };
    }
  };
  guardSocket(require('net'), ['connect', 'createConnection']);
  guardSocket(require('tls'), ['connect']);
  const http2 = require('http2');
  const h2connect = http2.connect;
  http2.connect = function guardedH2(authority, ...rest) { checkUrl(authority); return h2connect.call(this, authority, ...rest); };
  const dgram = require('dgram');
  dgram.createSocket = () => { blockedRequests.push('udp'); throw new Error('acesso à rede bloqueado: udp'); };
}
for (const [sw, val] of [
  ['disable-background-networking'], ['disable-component-update'], ['disable-domain-reliability'],
  ['disable-breakpad'], ['no-pings'], ['dns-prefetch-disable'],
  // WebRTC não passa pelo filtro de requisições: proíbe UDP direto (o app não usa WebRTC para nada)
  ['force-webrtc-ip-handling-policy', 'disable_non_proxied_udp'],
  // WebRtcHideLocalIpsWithMdns: anuncia nomes na rede local por mDNS (porta 5353) quando algo tenta WebRTC
  ['disable-features', 'MediaRouter,DialMediaRouteProvider,OptimizationHints,Translate,AutofillServerCommunication,SpellcheckService,NetworkTimeServiceQuerying,WebRtcHideLocalIpsWithMdns'],
]) app.commandLine.appendSwitch(sw, val);

// Pasta de dados (configurações, modelos de voz, último roteiro) em %LOCALAPPDATA%\Ghostprompter.
// Diferente de %APPDATA% (Roaming), a pasta Local não é sincronizada com servidor em perfis corporativos.
// Quem usava a versão antiga (Roaming\gravador-teleprompter) tem os dados movidos na primeira abertura.
// GHOSTPROMPTER_USERDATA permite usar outra pasta (útil para testes sem mexer nas suas configurações).
let usingLegacyData = false; // true = não deu para mover; o painel avisa
{
  const localData = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Ghostprompter');
  const oldData = path.join(app.getPath('appData'), 'gravador-teleprompter');
  const countFiles = (d) => fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
  // move a pasta; se estiver em outro disco/servidor, copia, confere e só então apaga a antiga
  const moveDir = (src, dst) => {
    try { fs.renameSync(src, dst); return true; } catch (e) {
      if (e.code !== 'EXDEV') return false; // ex.: em uso agora -> tenta de novo na próxima abertura
      try {
        fs.cpSync(src, dst, { recursive: true, errorOnExist: true, force: false });
        if (countFiles(src) !== countFiles(dst)) throw new Error('cópia incompleta');
        fs.rmSync(src, { recursive: true, force: true });
        return true;
      } catch { try { fs.rmSync(dst, { recursive: true, force: true }); } catch {} return false; }
    }
  };
  let dir = localData;
  // (com GHOSTPROMPTER_USERDATA, usado em testes, nada é movido)
  if (!process.env.GHOSTPROMPTER_USERDATA && !fs.existsSync(localData) && fs.existsSync(oldData)) {
    if (!moveDir(oldData, localData)) { dir = oldData; usingLegacyData = true; }
  }
  app.setPath('userData', process.env.GHOSTPROMPTER_USERDATA || dir);
}

// Na versão instalada, recusa abrir com opções de depuração (controle externo do app pelo depurador).
// (As opções de Node — --inspect, NODE_OPTIONS, ELECTRON_RUN_AS_NODE — são desligadas no próprio .exe pelos "fuses".)
if (app.isPackaged && process.argv.some((a) => /^--(remote-debugging|inspect|js-flags|remote-allow-origins)/i.test(a))) {
  process.exit(1);
}

// Pastas sincronizadas com a nuvem: o app não envia nada, mas o OneDrive/Dropbox/Google Drive enviariam.
function cloudSyncName(p) {
  const full = path.resolve(p).toLowerCase() + path.sep;
  for (const v of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
    const root = process.env[v];
    if (root && full.startsWith(path.resolve(root).toLowerCase() + path.sep)) return 'OneDrive';
  }
  const m = full.match(/[\\/](onedrive[^\\/]*|dropbox|google drive|googledrive|icloud ?drive|box sync|my drive)[\\/]/i);
  return m ? m[1] : null;
}

// Segurança: nenhuma janela do app navega para fora das próprias páginas nem abre pop-ups
// (ex.: arrastar um arquivo .html para a janela não pode carregá-lo com acesso às funções do app).
app.on('web-contents-created', (_e, wc) => {
  // WebRTC (conexões diretas por UDP, ex.: STUN) não passa pelo filtro de requisições:
  // com esta política, sem proxy configurado, ele não consegue sair do computador.
  wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  // sem recarregar (Ctrl+R/F5) nem DevTools (Ctrl+Shift+I/F12): recarregar no meio de uma gravação a cortaria
  wc.on('before-input-event', (e, input) => {
    const k = String(input.key || '').toLowerCase();
    const ctrl = input.control || input.meta;
    if (k === 'f5' || k === 'f12' || (ctrl && k === 'r') || (ctrl && input.shift && (k === 'i' || k === 'j' || k === 'c'))) e.preventDefault();
  });
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
});
// Só as páginas do próprio app (pasta src/) podem usar câmera/microfone e chamar as funções do app.
const APP_PAGES = pathToFileURL(path.join(__dirname, 'src')).href + '/';
const isAppPage = (wc) => !!wc && wc.getURL().startsWith(APP_PAGES);
const fromAppPage = (e) => (e.senderFrame?.url || '').startsWith(APP_PAGES);

// Protocolo interno para servir os modelos de voz ao reconhecedor (precisa de fetch + CORS)
protocol.registerSchemesAsPrivileged([
  { scheme: 'tpmodel', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// ---------------------------------------------------------------- modelos de voz (Vosk, offline)
// sha256 = "impressão digital" do .zip oficial em alphacephei.com (conferida em 04/11/2026; os arquivos
// não mudam no servidor desde 2020/2022). Se o download não bater, ele é descartado e nada é instalado.
const MODELS = {
  pt: { name: 'vosk-model-small-pt-0.3', label: 'Português (BR)', sizeMB: 31, bytes: 32453112,
    sha256: '6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7' },
  es: { name: 'vosk-model-small-es-0.42', label: 'Español', sizeMB: 39, bytes: 39817833,
    sha256: '09b239888f633ef2f0b4e09736e3d9936acfd810bc65d53fad45261762c6511f' },
  en: { name: 'vosk-model-small-en-us-0.15', label: 'English (US)', sizeMB: 40, bytes: 41205931,
    sha256: '30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498' },
};
const modelsDir = () => path.join(app.getPath('userData'), 'models');
const modelFile = (lang) => path.join(modelsDir(), MODELS[lang].name + '.tar.gz');
const downloading = new Map();

const hasModel = (lang) => typeof lang === 'string' && Object.hasOwn(MODELS, lang);

function modelInfo(lang) {
  if (!hasModel(lang)) return null;
  const m = MODELS[lang];
  return {
    lang, ...m,
    installed: fs.existsSync(modelFile(lang)),
    downloading: downloading.has(lang),
    url: `tpmodel://models/${m.name}.tar.gz`,
  };
}

function runTar(args) {
  return new Promise((resolve, reject) => {
    // só o tar.exe do próprio Windows, por caminho absoluto (nunca um "tar" achado no PATH)
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    if (!fs.existsSync(tar)) return reject(new Error('tar.exe do Windows não encontrado'));
    const p = spawn(tar, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('tar: ' + err.trim()))));
    p.on('error', reject);
  });
}

async function downloadModel(lang, onProgress) {
  const m = MODELS[lang];
  const dir = modelsDir();
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, m.name + '.zip');
  const tmp = path.join(dir, m.name + '.tmp');
  const MAX = 200 * 1024 * 1024; // nenhum modelo pequeno passa disso
  try {
    const res = await fetch(`https://alphacephei.com/vosk/models/${m.name}.zip`, { signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const declared = Number(res.headers.get('content-length')) || 0;
    if (declared > MAX) throw new Error(t('err.tooBig'));
    const total = declared || m.bytes;
    let got = 0;
    let lastPct = -1;
    const hash = crypto.createHash('sha256');
    const progress = new Transform({
      transform(chunk, _enc, cb) {
        got += chunk.length;
        hash.update(chunk);
        if (got > MAX) return cb(new Error(t('err.tooBig')));
        const pct = Math.min(100, Math.floor((got / total) * 100));
        if (pct !== lastPct) { lastPct = pct; onProgress({ stage: 'download', pct }); }
        cb(null, chunk);
      },
    });
    // pipeline: se a rede, o disco ou a escrita falharem, tudo é encerrado e o erro chega até a tela
    await pipeline(Readable.fromWeb(res.body), progress, fs.createWriteStream(zip));
    // confere a impressão digital antes de extrair qualquer coisa
    if (got !== m.bytes || hash.digest('hex') !== m.sha256) throw new Error(t('err.badHash'));
    onProgress({ stage: 'prepare', pct: 100 });
    // o reconhecedor quer .tar.gz com uma pasta raiz: zip -> pasta -> tar.gz
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp);
    await runTar(['-xf', zip, '-C', tmp]);
    const root = fs.readdirSync(tmp, { withFileTypes: true }).find((d) => d.isDirectory());
    if (!root) throw new Error('arquivo do modelo inesperado');
    await runTar(['-czf', modelFile(lang) + '.part', '-C', tmp, root.name]);
    fs.renameSync(modelFile(lang) + '.part', modelFile(lang));
  } finally {
    fs.rmSync(zip, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(modelFile(lang) + '.part', { force: true });
  }
}

// ---------------------------------------------------------------- settings
let settings = {};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  // ignora o marcador BOM caso o arquivo tenha sido editado à mão no Bloco de Notas
  try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8').replace(/^﻿/, '')); } catch { settings = {}; }
}
let saveTimer = null;
function flushSettings() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { console.error(e); }
}
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSettings, 300);
}

// Configurações que as telas podem alterar, com o tipo esperado.
// (A pasta de gravação só muda pelo diálogo "Alterar pasta", nunca direto pela tela.)
const SETTING_TYPES = {
  hideControl: 'boolean', fps: 'number', sysAudio: 'boolean', screenId: 'string',
  camOn: 'boolean', camId: 'string', camMode: 'string', camShape: 'string', camMirror: 'boolean',
  micOn: 'boolean', micId: 'string', scrollMode: 'string', voiceLang: 'string',
  autoScroll: 'boolean', countdown: 'boolean', rememberScript: 'boolean',
  uiLang: 'string',
};
// Pasta padrão: Vídeos\Ghostprompter. Quem já usava a versão antiga continua na pasta de antes.
function outputDir() {
  if (settings.outputDir) return settings.outputDir;
  const legacy = path.join(app.getPath('videos'), 'Gravacoes Teleprompter');
  if (fs.existsSync(legacy)) return legacy;
  // se a pasta Vídeos estiver na nuvem (ex.: backup do OneDrive), o padrão vira uma pasta só local
  const videos = app.getPath('videos');
  return path.join(cloudSyncName(videos) ? app.getPath('home') : videos, 'Ghostprompter');
}
const UI_LANGS = ['auto', ...I18N.LANGS];
const applyUiLang = () => I18N.setLang(settings.uiLang || 'auto', app.getLocale());

// ---------------------------------------------------------------- disco local
// As gravações saem em MP4 direto do gravador do Chromium (sem programa externo de conversão).
// Pasta de rede = os vídeos atravessariam a rede: recusado. Detecta caminhos UNC (\\servidor\...)
// e unidades mapeadas (Z: -> \\servidor\...), inclusive atalhos/junções que apontem para a rede.
function mappedNetworkDrives() {
  try {
    const r = spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'net.exe'), ['use'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const set = new Set();
    for (const m of String(r.stdout || '').matchAll(/(?:^|\s)([A-Za-z]):\s+\\\\/gm)) set.add(m[1].toUpperCase());
    return set;
  } catch { return new Set(); }
}
function isRemotePath(p) {
  const isUnc = (c) => /^(\\\\|\/\/)/.test(c);
  const mapped = mappedNetworkDrives();
  const isMapped = (c) => /^[A-Za-z]:/.test(c) && mapped.has(c[0].toUpperCase());
  const resolved = path.resolve(p);
  // decide pelo texto primeiro: um caminho \\servidor\... nunca é consultado (consultar já seria acessar a rede)
  if (isUnc(resolved) || isMapped(resolved)) return true;
  let real = resolved;
  try { real = fs.realpathSync.native(resolved); } catch {} // atalho/junção local que aponte para a rede
  return isUnc(real) || isMapped(real);
}
function freeBytes(p) {
  try { const s = fs.statfsSync(p); return s.bavail * s.bsize; } catch { return Infinity; }
}
const MIN_FREE = 1024 * 1024 * 1024; // 1 GB
// erro de disco -> mensagem compreensível (disco cheio, limite de 4 GB do FAT32 etc.)
function diskError(err, file) {
  const code = err && err.code;
  if (code === 'ENOSPC') return new Error(t('err.diskFull'));
  if (code === 'EFBIG') return new Error(t('err.fileTooBig'));
  return new Error(t('err.saveFailed', { file: path.basename(file), msg: err.message }));
}

// ---------------------------------------------------------------- windows
let controlWin = null;
let prompterWin = null;
let recording = false;
let quitting = false;

const preload = path.join(__dirname, 'preload.js');

function createControl() {
  controlWin = new BrowserWindow({
    width: 500, height: 900, minWidth: 420, minHeight: 500,
    title: 'Ghostprompter',
    backgroundColor: '#14161b',
    autoHideMenuBar: true,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
  });
  controlWin.setContentProtection(settings.hideControl !== false);
  controlWin.loadFile(path.join(__dirname, 'src', 'control.html'));
  controlWin.on('close', (e) => {
    if (recording && !quitting) {
      e.preventDefault();
      controlWin.webContents.send('app:stop-and-quit');
    }
  });
  controlWin.on('closed', () => { controlWin = null; quitting = true; app.quit(); });
  // Se a tela do painel travar ou recarregar no meio de uma gravação, fecha os arquivos para não ficarem abertos
  const abortOpenRecordings = () => {
    for (const f of files.values()) { try { f.ws.end(); } catch {} }
    files.clear();
    recording = false;
  };
  controlWin.webContents.on('render-process-gone', abortOpenRecordings);
  controlWin.webContents.once('did-finish-load', () => {
    controlWin?.webContents.on('did-start-loading', abortOpenRecordings);
  });
}

function defaultPrompterBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  const width = Math.min(760, wa.width - 40);
  const height = 260;
  return { x: Math.round(wa.x + (wa.width - width) / 2), y: wa.y + 12, width, height };
}
function boundsVisible(b) {
  return screen.getAllDisplays().some(({ workArea: w }) =>
    b.x < w.x + w.width - 40 && b.x + b.width > w.x + 40 && b.y >= w.y - 20 && b.y < w.y + w.height - 40);
}

function createPrompter() {
  const saved = settings.prompterBounds;
  const b = saved && boundsVisible(saved) ? saved : defaultPrompterBounds();
  prompterWin = new BrowserWindow({
    ...b,
    minWidth: 220, minHeight: 110,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    title: 'Teleprompter',
    backgroundColor: '#000000',
    show: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
  });
  // Fica acima até de apresentações em tela cheia
  prompterWin.setAlwaysOnTop(true, 'screen-saver');
  // A mágica: no Windows 10 2004+ usa WDA_EXCLUDEFROMCAPTURE -> some de qualquer captura de tela
  prompterWin.setContentProtection(true);
  prompterWin.setOpacity(settings.prompterOpacity ?? 0.85);
  prompterWin.loadFile(path.join(__dirname, 'src', 'prompter.html'));
  prompterWin.once('ready-to-show', () => { prompterWin.showInactive(); sendPrompterVisible(); });

  const persist = () => {
    if (prompterWin && !prompterWin.isDestroyed()) {
      settings.prompterBounds = prompterWin.getBounds();
      saveSettings();
    }
  };
  prompterWin.on('moved', persist);
  prompterWin.on('resized', persist);
  prompterWin.on('close', (e) => {
    if (!quitting) { e.preventDefault(); prompterWin.hide(); sendPrompterVisible(); }
  });
}

// ---------------------------------------------------------------- janela da câmera (aparece na gravação)
let camWin = null;
let camConfig = { visible: false };

function camAspect(shape) { return shape === 'circle' ? 1 : 9 / 16; }
function defaultCamBounds(shape) {
  const wa = screen.getPrimaryDisplay().workArea;
  const width = shape === 'circle' ? 260 : 400;
  const height = Math.round(width * camAspect(shape));
  return { x: wa.x + wa.width - width - 30, y: wa.y + wa.height - height - 30, width, height };
}

function createCamWin() {
  const shape = camConfig.shape || 'circle';
  const saved = settings.camBounds;
  let b = saved && boundsVisible(saved) ? saved : defaultCamBounds(shape);
  b = { ...b, height: Math.round(b.width * camAspect(shape)) };
  camWin = new BrowserWindow({
    ...b,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false,
    title: 'Câmera',
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
  });
  camWin.setAlwaysOnTop(true, 'screen-saver');
  camWin.loadFile(path.join(__dirname, 'src', 'camera.html'));
  camWin.webContents.once('did-finish-load', () => applyCamConfig());
  // fechar a janela da câmera (ex.: Alt+F4) desliga a câmera de verdade e avisa o painel
  camWin.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    camConfig = { ...camConfig, visible: false };
    applyCamConfig();
    controlWin?.webContents.send('cam:closed');
  });
}

function applyCamConfig() {
  if (!camConfig.visible) {
    if (camWin && !camWin.isDestroyed()) { camWin.webContents.send('cam:config', camConfig); camWin.hide(); }
    return;
  }
  if (!camWin) { createCamWin(); return; }
  const b = camWin.getBounds();
  const h = Math.round(b.width * camAspect(camConfig.shape));
  if (h !== b.height) camWin.setBounds({ ...b, height: h });
  camWin.webContents.send('cam:config', camConfig);
  if (!camWin.isVisible()) { camWin.showInactive(); camWin.setAlwaysOnTop(true, 'screen-saver'); }
}

function sendPrompterVisible() {
  const visible = !!prompterWin?.isVisible();
  controlWin?.webContents.send('prompter:visible', visible);
  toPrompter({ type: 'visible', value: visible }); // prompter escondido não escuta o microfone
}
function togglePrompter(force) {
  if (!prompterWin) return;
  const show = force ?? !prompterWin.isVisible();
  if (show) { prompterWin.showInactive(); prompterWin.setAlwaysOnTop(true, 'screen-saver'); } else prompterWin.hide();
  sendPrompterVisible();
}
function toPrompter(cmd) {
  prompterWin?.webContents.send('prompter:cmd', cmd);
}

// ---------------------------------------------------------------- IPC
const files = new Map();
let nextFileId = 1;
let sessionDir = null;

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}s`;
}

// Encerra um arquivo de gravação e espera ele realmente fechar (também em caso de erro de disco).
function closeRecFile(f) {
  return new Promise((resolve) => {
    if (f.ws.closed || f.ws.destroyed) return resolve();
    f.ws.once('close', resolve);
    f.ws.end();
  });
}

function registerIpc() {
  // Toda chamada precisa vir de uma página do próprio app; o resto é recusado.
  const ipcMain = {
    handle: (ch, fn) => electronIpc.handle(ch, (e, ...a) => {
      if (!fromAppPage(e)) throw new Error('origem não autorizada');
      return fn(e, ...a);
    }),
    on: (ch, fn) => electronIpc.on(ch, (e, ...a) => { if (fromAppPage(e)) fn(e, ...a); }),
  };
  ipcMain.handle('ui:lang', () => I18N.lang);
  ipcMain.handle('settings:get', () => ({
    ...settings,
    outputDir: outputDir(),
    cloudSync: cloudSyncName(outputDir()),
    legacyData: usingLegacyData,
    shortcuts: activeShortcuts,
  }));
  ipcMain.handle('settings:set', (_e, patch) => {
    if (!patch || typeof patch !== 'object') return false;
    for (const [k, v] of Object.entries(patch)) {
      if (SETTING_TYPES[k] && typeof v === SETTING_TYPES[k]) settings[k] = v;
    }
    if (typeof patch.hideControl === 'boolean') controlWin?.setContentProtection(patch.hideControl);
    if ('uiLang' in patch) {
      if (!UI_LANGS.includes(settings.uiLang)) settings.uiLang = 'auto';
      const lang = applyUiLang();
      // avisa todas as janelas para trocarem de idioma na hora
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('ui:lang', lang);
    }
    saveSettings();
    return true;
  });

  ipcMain.handle('sources:get', async () => {
    const own = ['Teleprompter', 'Ghostprompter', 'Gravador + Teleprompter', 'Câmera'];
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 },
    });
    return sources
      .filter((s) => !own.includes(s.name))
      .map((s) => ({
        id: s.id, name: s.name, isScreen: s.id.startsWith('screen:'),
        thumb: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL(),
      }));
  });

  ipcMain.handle('rec:begin', () => {
    // nunca grava numa pasta de rede (os vídeos atravessariam a rede) nem com o disco quase cheio
    if (isRemotePath(outputDir())) throw new Error(t('err.remoteFolder'));
    fs.mkdirSync(outputDir(), { recursive: true });
    const free = freeBytes(outputDir());
    if (free < MIN_FREE) throw new Error(t('err.lowDisk', { gb: (free / 1e9).toFixed(1) }));
    // pasta exclusiva por gravação: duas gravações no mesmo segundo nunca se sobrescrevem
    const base = path.join(outputDir(), `${t('file.session')} ${stamp()}`);
    let dir = base;
    for (let n = 2; ; n++) {
      try { fs.mkdirSync(dir); break; } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        dir = `${base} (${n})`;
      }
    }
    sessionDir = dir;
    recording = true;
    return sessionDir;
  });
  ipcMain.handle('rec:open', (_e, kind, ext) => {
    // a tela só diz QUAL arquivo quer ('screen'/'camera') e o formato; o nome é decidido aqui, no idioma da interface
    if (!sessionDir || !['screen', 'camera'].includes(kind) || !['mp4', 'webm'].includes(ext)) throw new Error('arquivo de gravação inválido');
    const p = path.join(sessionDir, t('file.' + kind) + '.' + ext);
    const id = nextFileId++;
    // 'wx': nunca abre por cima de um arquivo que já existe
    const f = { p, ws: fs.createWriteStream(p, { flags: 'wx' }), error: null };
    // sem este listener, um erro de disco (cheio, sem permissão, pendrive removido) derrubaria o app
    f.ws.on('error', (err) => { f.error = f.error || err; });
    files.set(id, f);
    return id;
  });
  ipcMain.handle('rec:chunk', (_e, id, data) => new Promise((resolve, reject) => {
    const f = files.get(id);
    if (!f) return resolve();
    if (f.error) return reject(diskError(f.error, f.p));
    f.ws.write(Buffer.from(data), (err) => (err ? reject(diskError(err, f.p)) : resolve()));
  }));
  ipcMain.handle('rec:close', async (_e, id) => {
    const f = files.get(id);
    if (!f) return null;
    files.delete(id);
    await closeRecFile(f);
    // mesmo com erro de disco o trecho já gravado fica salvo: devolve o arquivo E o motivo
    return { file: f.p, error: f.error ? diskError(f.error, f.p).message : null };
  });
  ipcMain.handle('rec:end', async () => {
    // fecha qualquer arquivo que tenha ficado aberto nesta sessão
    await Promise.all([...files.values()].map(closeRecFile));
    files.clear();
    recording = false;
    return sessionDir;
  });

  ipcMain.handle('folder:choose', async () => {
    const r = await dialog.showOpenDialog(controlWin, { properties: ['openDirectory', 'createDirectory'], defaultPath: outputDir() });
    if (r.canceled || !r.filePaths[0]) return null;
    // pasta de rede: recusada (as gravações atravessariam a rede)
    if (isRemotePath(r.filePaths[0])) {
      dialog.showMessageBox(controlWin, { type: 'warning', message: t('err.remoteFolder') });
      return null;
    }
    settings.outputDir = r.filePaths[0];
    saveSettings();
    return settings.outputDir;
  });
  ipcMain.handle('folder:open', (_e, p) => {
    // só abre a pasta de gravações (ou uma subpasta dela) — nunca um caminho qualquer vindo da tela
    const base = path.resolve(outputDir());
    let target = typeof p === 'string' && p ? path.resolve(p) : base;
    if (target !== base && !target.startsWith(base + path.sep)) target = base;
    fs.mkdirSync(target, { recursive: true });
    if (!fs.statSync(target).isDirectory()) return 'não é uma pasta';
    return shell.openPath(target);
  });

  ipcMain.handle('text:open', async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(parent, {
      properties: ['openFile'],
      filters: [{ name: t('dlg.script'), extensions: ['txt', 'md', 'markdown'] }, { name: t('dlg.all'), extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    if (fs.statSync(r.filePaths[0]).size > 1024 * 1024) {
      dialog.showMessageBox(parent, { type: 'warning', message: t('dlg.tooBig') });
      return null;
    }
    const content = fs.readFileSync(r.filePaths[0], 'utf8');
    const name = path.basename(r.filePaths[0]);
    toPrompter({ type: 'load', name, content });
    togglePrompter(true);
    return name;
  });

  ipcMain.on('prompter:cmd', (_e, cmd) => toPrompter(cmd));
  ipcMain.on('prompter:state', (_e, s) => controlWin?.webContents.send('prompter:state', s));
  ipcMain.on('prompter:toggle', (_e, force) => togglePrompter(force));
  ipcMain.on('prompter:opacity', (_e, v) => {
    const o = Math.min(1, Math.max(0.2, Number(v) || 0.85));
    prompterWin?.setOpacity(o);
    settings.prompterOpacity = o;
    saveSettings();
  });
  ipcMain.on('app:quit', () => { quitting = true; app.quit(); });

  ipcMain.handle('model:info', (_e, lang) => modelInfo(lang));
  ipcMain.handle('model:download', async (_e, lang) => {
    if (!hasModel(lang)) return false;
    if (downloading.has(lang)) return downloading.get(lang);
    const send = (p) => {
      controlWin?.webContents.send('model:progress', { lang, ...p });
      prompterWin?.webContents.send('model:progress', { lang, ...p });
    };
    const job = downloadModel(lang, send)
      .then(() => { send({ stage: 'done', pct: 100 }); return true; })
      .catch((e) => { send({ stage: 'error', error: e.message }); return false; })
      .finally(() => downloading.delete(lang));
    downloading.set(lang, job);
    return job;
  });

  ipcMain.on('cam:config', (_e, cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    camConfig = {
      visible: cfg.visible === true, deviceId: typeof cfg.deviceId === 'string' ? cfg.deviceId : '',
      shape: cfg.shape === 'rounded' ? 'rounded' : 'circle', mirror: cfg.mirror === true,
    };
    applyCamConfig();
  });
  ipcMain.handle('cam:bounds', () => camWin?.getBounds());
  ipcMain.on('cam:set-bounds', (_e, b) => {
    if (!camWin || !b || ![b.x, b.y, b.width].every(Number.isFinite)) return;
    const width = Math.max(120, Math.min(1600, Math.round(b.width)));
    const nb = { x: Math.round(b.x), y: Math.round(b.y), width, height: Math.round(width * camAspect(camConfig.shape)) };
    camWin.setBounds(nb);
    settings.camBounds = nb;
    saveSettings();
  });
}

// Cada ação tenta o primeiro atalho livre da lista (outro programa pode já ter registrado algum)
const activeShortcuts = [];
function registerShortcuts() {
  // o primeiro item é a chave de tradução do nome da ação (o painel mostra no idioma escolhido)
  const actions = [
    ['sc.record', ['Ctrl+Alt+R', 'Ctrl+Shift+F9'], () => controlWin?.webContents.send('rec:toggle')],
    ['sc.toggle', ['Ctrl+Alt+Space', 'Ctrl+Alt+P', 'Ctrl+Shift+F10'], () => toPrompter({ type: 'toggle' })],
    ['sc.faster', ['Ctrl+Alt+Up', 'Ctrl+Shift+Up'], () => toPrompter({ type: 'faster' })],
    ['sc.slower', ['Ctrl+Alt+Down', 'Ctrl+Shift+Down'], () => toPrompter({ type: 'slower' })],
    ['sc.reset', ['Ctrl+Alt+Home', 'Ctrl+Shift+Home'], () => toPrompter({ type: 'reset' })],
    ['sc.back', ['Ctrl+Alt+PageUp', 'Ctrl+Shift+PageUp'], () => toPrompter({ type: 'jump', dir: -1 })],
    ['sc.fwd', ['Ctrl+Alt+PageDown', 'Ctrl+Shift+PageDown'], () => toPrompter({ type: 'jump', dir: 1 })],
    ['sc.prompter', ['Ctrl+Alt+T', 'Ctrl+Shift+F11'], () => togglePrompter()],
  ];
  for (const [key, accs, fn] of actions) {
    const acc = accs.find((a) => { try { return globalShortcut.register(a, fn); } catch { return false; } });
    activeShortcuts.push({ key, acc: acc || null });
    if (!acc) console.warn('No free shortcut for:', key);
  }
}

// ---------------------------------------------------------------- app
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (controlWin) { controlWin.show(); controlWin.focus(); } });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null); // sem o menu padrão (e seus atalhos de recarregar/DevTools)
    // computador vai suspender: o painel finaliza e salva a gravação antes
    powerMonitor.on('suspend', () => controlWin?.webContents.send('power:suspend'));
    loadSettings();
    applyUiLang();
    // rede das janelas: só recursos locais. Qualquer endereço de internet é cancelado antes de sair.
    // "file:" só dentro da pasta do próprio app: um file://servidor/... viraria acesso de rede (SMB) no Windows
    const APP_ROOT = pathToFileURL(__dirname).href + '/';
    const LOCAL = /^(tpmodel|blob|data):/i;
    session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
      const ok = LOCAL.test(details.url) || details.url.startsWith(APP_ROOT);
      if (!ok) blockedRequests.push(details.url.slice(0, 80));
      cb({ cancel: !ok });
    });
    session.defaultSession.setSpellCheckerEnabled(false);
    // a mesma trava para o módulo "net" do Electron no processo principal
    for (const fn of ['request', 'fetch']) {
      const orig = net[fn].bind(net);
      net[fn] = (target, ...rest) => {
        checkUrl(typeof target === 'string' || target instanceof URL ? target : target.url);
        return orig(target, ...rest);
      };
    }

    // câmera, microfone e captura de tela só para as páginas do próprio app
    const allowed = (wc, perm) => ['media', 'display-capture'].includes(perm) && isAppPage(wc);
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allowed(wc, perm)));
    session.defaultSession.setPermissionCheckHandler((wc, perm) => allowed(wc, perm));
    protocol.handle('tpmodel', (req) => {
      const name = path.basename(decodeURIComponent(new URL(req.url).pathname));
      const lang = Object.keys(MODELS).find((k) => MODELS[k].name + '.tar.gz' === name);
      if (!lang || !fs.existsSync(modelFile(lang))) return new Response('not found', { status: 404 });
      const file = modelFile(lang);
      return new Response(Readable.toWeb(fs.createReadStream(file)), {
        headers: {
          'content-type': 'application/gzip',
          'content-length': String(fs.statSync(file).size),
          'access-control-allow-origin': '*',
        },
      });
    });
    registerIpc();
    createControl();
    createPrompter();
    registerShortcuts();
  });

  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); if (saveTimer) flushSettings(); });
  app.on('window-all-closed', () => app.quit());
}
