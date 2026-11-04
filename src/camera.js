/* global api */
const video = document.getElementById('video');
const msg = document.getElementById('msg');
let stream = null;
let cfg = {};
let startToken = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// idioma da interface
I18N.setLang('auto', navigator.language);
I18N.apply(document);
api.getUiLang().then((l) => { I18N.setLang(l); I18N.apply(document); });
api.on('ui:lang', (l) => { I18N.setLang(l); I18N.apply(document); });

function stop() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}

async function start() {
  const token = ++startToken;
  stop();
  if (!cfg.visible || !cfg.deviceId) return;
  msg.textContent = I18N.t('cam.starting');
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      // mesmas restrições do painel para compartilhar o dispositivo sem conflito
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: cfg.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      });
      if (token !== startToken) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      video.srcObject = s;
      msg.textContent = '';
      return;
    } catch (e) {
      if (attempt === 4) msg.textContent = I18N.t('cam.unavailable') + '\n' + e.message;
      else await sleep(700 * attempt);
    }
  }
}

api.on('cam:config', (c) => {
  const restart = c.deviceId !== cfg.deviceId || c.visible !== cfg.visible || !stream;
  cfg = c;
  document.body.className = `shape-${c.shape || 'circle'}` + (c.mirror ? ' mirror' : '');
  if (!c.visible) { startToken++; stop(); return; }
  if (restart) start();
});

// ---- mover (arrastar em qualquer lugar) e redimensionar (canto / roda do mouse)
let op = null;
async function begin(e, kind) {
  e.preventDefault();
  const pointer = { id: e.pointerId, sx: e.screenX, sy: e.screenY };
  e.currentTarget.setPointerCapture(e.pointerId);
  const b = await api.camBounds();
  if (!b) return;
  op = { kind, ...pointer, b };
  document.body.classList.add('dragging');
}
function move(e) {
  if (!op) return;
  const dx = e.screenX - op.sx;
  const dy = e.screenY - op.sy;
  if (op.kind === 'move') api.camSetBounds({ ...op.b, x: op.b.x + dx, y: op.b.y + dy });
  else api.camSetBounds({ ...op.b, width: op.b.width + Math.max(dx, dy) });
}
function end() { op = null; document.body.classList.remove('dragging'); }

const frame = document.getElementById('frame');
const handle = document.getElementById('resize');
frame.addEventListener('pointerdown', (e) => begin(e, 'move'));
handle.addEventListener('pointerdown', (e) => { e.stopPropagation(); begin(e, 'resize'); });
for (const el of [frame, handle]) {
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

let wheelBusy = false;
window.addEventListener('wheel', async (e) => {
  e.preventDefault();
  if (wheelBusy) return;
  wheelBusy = true;
  const b = await api.camBounds();
  if (b) {
    const f = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const w = b.width * f;
    const h = b.height * f;
    api.camSetBounds({ x: b.x - (w - b.width) / 2, y: b.y - (h - b.height) / 2, width: w, height: h });
  }
  setTimeout(() => { wheelBusy = false; }, 30);
}, { passive: false });
