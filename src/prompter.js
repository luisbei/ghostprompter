/* global api, renderScript, Voice */
const $ = (id) => document.getElementById(id);
const content = $('content');
const viewport = $('viewport');

const store = {
  get(k, d) { try { const v = localStorage.getItem('tp.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tp.' + k, JSON.stringify(v)); } catch {} },
};

let speed = store.get('speed', 40);        // pixels por segundo (modo manual / pausa por voz)
let fontSize = store.get('font', 36);
let mirror = store.get('mirror', false);
let fileName = store.get('fileName', '');
let scriptText = store.get('text', '');
let pos = 0;
let playing = false;
let lastT = 0;
let vel = 0;                               // velocidade suavizada (modo pausa por voz)

// ------------------------------------------------------------------ voz
let voiceCfg = { mode: 'manual', lang: 'auto', micId: 'default' };
let voiceState = { state: 'off', lang: null, needModel: false, speaking: false, error: null };
let voiceKey = '';
let testStream = null;
let words = [];                            // [{ el, n }]
let aligner = null;
let follow = { idx: -1, disp: -1, vel: 0, time: 0, wps: 2.2, marked: -1 };

const engine = new Voice.VoiceEngine({
  onSpeaking(s) { voiceState.speaking = s; document.body.classList.toggle('speaking', s); sendState(true); },
  onStatus(s) { voiceState.state = s.state; voiceState.error = s.error || null; updateMicDot(); sendState(true); },
  onWords(hyp) {
    // pausado: o que você fala (ensaio, conversa) não move o ponto de leitura
    if (!aligner || voiceCfg.mode !== 'follow' || !playing) return;
    const prev = aligner.cur;
    const j = aligner.update(hyp);
    if (j == null) return;
    const now = performance.now();
    const di = j - prev;
    const dt = (now - follow.time) / 1000;
    if (prev >= 0 && di > 0 && di < 20 && dt > 0.25 && dt < 6) {
      follow.wps = Math.max(0.8, Math.min(5, follow.wps * 0.7 + (di / dt) * 0.3));
    }
    follow.idx = j;
    follow.time = now;
    markRead(j);
  },
});

function updateMicDot() {
  const dot = $('mic');
  dot.className = voiceCfg.mode === 'manual' ? '' : 'on ' + (voiceState.state || '');
  const key = {
    loading: 'mic.loading',
    listening: 'mic.listening',
    vad: voiceCfg.mode === 'follow' ? 'mic.nomodel' : 'mic.vad',
    error: 'mic.error',
  }[voiceState.state];
  dot.title = key ? I18N.t(key, { msg: voiceState.error || '' }) : '';
}

// Cada mudança de configuração invalida as anteriores: uma chamada antiga que ainda estava
// esperando (ex.: consultando o modelo) não pode religar o microfone depois que você voltou ao manual.
let voiceGen = 0;
let prompterShown = true; // escondido = não escuta o microfone, venha a ordem de onde vier

async function applyVoice(force) {
  const gen = ++voiceGen;
  const mode = voiceCfg.mode;
  if (mode === 'manual' || !prompterShown) {
    voiceKey = '';
    voiceState = { state: 'off', speaking: false };
    await engine.stop();
    updateMicDot();
    sendState(true);
    return;
  }
  const lang = voiceCfg.lang === 'auto' ? Voice.detectLang(scriptText || '') : voiceCfg.lang;
  let modelUrl = null;
  let needModel = false;
  if (mode === 'follow') {
    const info = await api.modelInfo(lang);
    if (gen !== voiceGen) return;
    if (info?.installed) modelUrl = info.url; else needModel = true;
  }
  const key = [mode, lang, voiceCfg.micId, modelUrl, !!testStream].join('|');
  voiceState.lang = lang;
  voiceState.needModel = needModel;
  if (!force && key === voiceKey) { sendState(true); return; }
  voiceKey = key;
  try {
    await engine.start({ micId: voiceCfg.micId, modelUrl, stream: testStream });
  } catch (e) {
    if (gen !== voiceGen) return;
    voiceState.state = 'error';
    voiceState.error = e.message;
  }
  // se nesse meio-tempo voltou ao manual, desliga o que acabou de ligar
  if (gen !== voiceGen && voiceCfg.mode === 'manual') { await engine.stop(); return; }
  updateMicDot();
  sendState(true);
}

// envolve cada palavra num <span> para saber onde ela está na tela
function indexWords() {
  words = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    // deixas [assim] / (assim) e títulos não precisam ser lidos: ficam fora do acompanhamento por voz
    acceptNode: (n) => (n.parentElement.closest('.cue, .hint, h1, h2, h3') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parts = node.textContent.split(/(\s+)/);
    if (parts.length === 1 && !Voice.norm(parts[0])) continue;
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      const n = Voice.norm(part);
      if (!n) { frag.appendChild(document.createTextNode(part)); continue; }
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = part;
      frag.appendChild(span);
      words.push({ el: span, n });
    }
    node.replaceWith(frag);
  }
  // último índice de palavra de cada bloco (parágrafo, item, título)
  let end = words.length - 1;
  for (let i = words.length - 1; i >= 0; i--) {
    const block = words[i].el.closest('p, li, h1, h2, h3, blockquote') || content;
    if (i === words.length - 1 || block !== words[i + 1].block) end = i;
    words[i].block = block;
    words[i].blockEnd = end;
  }
  aligner = new Voice.ScriptAligner(words);
  follow = { idx: -1, disp: -1, vel: 0, time: 0, wps: 2.2, marked: -1 };
}

function markRead(j) {
  if (j > follow.marked) for (let i = follow.marked + 1; i <= j; i++) words[i]?.el.classList.add('read');
  else for (let i = follow.marked; i > j; i--) words[i]?.el.classList.remove('read');
  follow.marked = j;
}

const guidePx = () => parseFloat(getComputedStyle(content).paddingTop) || window.innerHeight * 0.28;

// posição vertical "contínua" da palavra i (interpola dentro da linha pela posição horizontal)
function wordY(i) {
  if (!words.length) return 0;
  const k = Math.max(0, Math.min(words.length - 1, Math.floor(i)));
  const el = words[k].el;
  const lineH = el.offsetHeight || fontSize * 1.45;
  const left = el.offsetLeft - content.clientLeft;
  const frac = Math.max(0, Math.min(1, left / Math.max(1, content.clientWidth)));
  return el.offsetTop + frac * lineH * 0.9;
}

// índice da palavra que está na linha-guia agora (para reancorar após ajuste manual)
function wordAtGuide() {
  const y = pos + guidePx() + 2;
  let lo = 0;
  let hi = words.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].el.offsetTop <= y) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
function reanchor() {
  if (!aligner) return;
  const i = wordAtGuide();
  aligner.cur = i;
  follow.idx = i;
  follow.disp = i;
  follow.vel = 0;
  follow.time = performance.now();
  markRead(i);
}

// ------------------------------------------------------------------ estado
function maxPos() { return Math.max(0, content.scrollHeight - viewport.clientHeight); }
function progress() { const m = maxPos(); return m ? pos / m : 0; }

let lastSent = 0;
function sendState(force) {
  const now = performance.now();
  if (!force && now - lastSent < 250) return;
  lastSent = now;
  api.prompterState({
    playing, speed, fileName, progress: progress(),
    voice: { mode: voiceCfg.mode, ...voiceState },
  });
}

function apply() {
  content.style.transform = `translateY(${-pos}px)`;
  $('progress').firstElementChild.style.width = (progress() * 100).toFixed(2) + '%';
}

function setPos(p, manual) {
  pos = Math.max(0, Math.min(maxPos(), p));
  apply();
  if (manual && voiceCfg.mode === 'follow') reanchor();
  sendState();
}

function setPlaying(v) {
  playing = v && maxPos() > 0;
  if (playing && pos >= maxPos() - 1) { pos = 0; apply(); reanchor(); }
  $('play').textContent = playing ? '❚❚' : '▶';
  $('play').classList.toggle('on', playing);
  lastT = 0;
  vel = 0;
  follow.vel = 0;
  sendState(true);
}

function setSpeed(v) {
  speed = Math.max(5, Math.min(600, Math.round(v)));
  $('speed').textContent = speed;
  store.set('speed', speed);
  sendState(true);
}

function setFont(v) {
  const anchor = progress();
  fontSize = Math.max(14, Math.min(140, Math.round(v)));
  document.documentElement.style.setProperty('--font', fontSize + 'px');
  store.set('font', fontSize);
  pos = anchor * maxPos(); // mantém o lugar na leitura
  apply();
}

function setMirror(v) {
  mirror = v;
  viewport.classList.toggle('mirror', mirror);
  $('mirror').classList.toggle('on', mirror);
  store.set('mirror', mirror);
}

function render(name, text) {
  const isMd = /\.(md|markdown)$/i.test(name) || /^\s*#\s/m.test(text);
  content.innerHTML = renderScript(text, isMd);
  indexWords();
}

// Privacidade: o roteiro só fica guardado no app se "Lembrar o último roteiro" estiver ligado.
let rememberScript = store.get('remember', true);
const HINT_HTML = content.innerHTML;

function forgetScript() {
  try { localStorage.removeItem('tp.text'); localStorage.removeItem('tp.fileName'); } catch {}
}

function clearScript() {
  forgetScript();
  fileName = '';
  scriptText = '';
  content.innerHTML = HINT_HTML;
  I18N.apply(document);
  indexWords();
  setPlaying(false);
  setPos(0);
  sendState(true);
}

function load(name, text) {
  render(name, text);
  fileName = name;
  scriptText = text;
  if (rememberScript) { store.set('fileName', name); store.set('text', text); }
  setPlaying(false);
  setPos(0);
  if (voiceCfg.mode !== 'manual') applyVoice(); // idioma automático pode mudar
  sendState(true);
}

// ------------------------------------------------------------------ animação
function frame(t) {
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
  lastT = t;
  if (playing && dt) {
    const mode = voiceCfg.mode;
    const recognizing = mode === 'follow' && voiceState.state === 'listening';
    if (recognizing) {
      // segue a última palavra reconhecida + previsão curta enquanto você fala.
      // A previsão (disp) nunca recua sozinha e não passa do fim do parágrafo atual.
      if (follow.disp < follow.idx || follow.disp > follow.idx + 3) follow.disp = follow.idx;
      if (voiceState.speaking && follow.idx >= 0) {
        // avança no ritmo da sua fala e vai freando ao se afastar da última palavra confirmada
        const ahead = follow.disp - follow.idx;
        const rate = follow.wps * 0.75 * Math.max(0, 1 - ahead / 2.2);
        const cap = words[follow.idx].blockEnd + 0.6;
        follow.disp = Math.min(cap, follow.disp + rate * dt);
      }
      const target = Math.min(maxPos(), Math.max(0, wordY(Math.max(follow.idx, follow.disp)) - guidePx()));
      // mola criticamente amortecida: acelera e freia suave, sem "trancos" a cada palavra
      const w = 2.4;
      const err = target - pos;
      follow.vel += (w * w * err - 2 * w * follow.vel) * dt;
      const lineH = fontSize * 1.45;
      if (follow.vel < 0 && err > -lineH * 0.6) follow.vel = 0; // pequenos ajustes nunca voltam o texto
      pos += follow.vel * dt;
    } else if (mode !== 'manual') {
      // pausa por voz: rola na velocidade definida só enquanto você fala
      const targetVel = voiceState.speaking ? speed * (fontSize / 36) : 0;
      vel += (targetVel - vel) * (1 - Math.exp(-dt * (targetVel > vel ? 6 : 4)));
      pos += vel * dt;
    } else {
      // velocidade escala com a fonte para manter "linhas por minuto" constante
      pos += speed * dt * (fontSize / 36);
    }
    if (pos >= maxPos()) { pos = maxPos(); if (mode === 'manual') setPlaying(false); }
    apply();
    sendState();
  }
  requestAnimationFrame(frame);
}

let cdTimer = null;
function countdown(seconds) {
  const el = $('countdown');
  clearInterval(cdTimer);
  let n = seconds;
  el.textContent = n;
  el.classList.add('show');
  cdTimer = setInterval(() => {
    n -= 1;
    if (n <= 0) { clearInterval(cdTimer); el.classList.remove('show'); } else el.textContent = n;
  }, 1000);
}

// ------------------------------------------------------------------ comandos
function handle(cmd) {
  switch (cmd.type) {
    case 'toggle': setPlaying(!playing); break;
    case 'play': setPlaying(true); break;
    case 'pause': setPlaying(false); break;
    case 'faster': setSpeed(speed + (speed < 60 ? 5 : 10)); break;
    case 'slower': setSpeed(speed - (speed <= 60 ? 5 : 10)); break;
    case 'reset': setPos(0, true); break;
    case 'jump': setPos(pos + cmd.dir * viewport.clientHeight * 0.6, true); break;
    case 'load': load(cmd.name, cmd.content); break;
    case 'countdown': countdown(cmd.seconds || 3); break;
    case 'voice':
      voiceCfg = { ...voiceCfg, ...cmd.cfg };
      document.body.classList.toggle('voice-follow', voiceCfg.mode === 'follow');
      applyVoice(cmd.force);
      break;
    case 'remember':
      rememberScript = !!cmd.value;
      store.set('remember', rememberScript);
      if (!rememberScript) forgetScript();
      else if (scriptText) { store.set('fileName', fileName); store.set('text', scriptText); }
      break;
    case 'clearScript': clearScript(); break;
    case 'visible':
      // prompter escondido não precisa ouvir: solta o microfone; ao reaparecer, volta a ouvir
      prompterShown = cmd.value !== false;
      applyVoice(true);
      break;
    case 'ping': sendState(true); break;
  }
}
api.on('prompter:cmd', handle);
api.on('model:progress', (p) => { if (p.stage === 'done' && voiceCfg.mode === 'follow') applyVoice(); });

$('open').onclick = () => api.openText();
$('play').onclick = () => handle({ type: 'toggle' });
$('faster').onclick = () => handle({ type: 'faster' });
$('slower').onclick = () => handle({ type: 'slower' });
$('reset').onclick = () => handle({ type: 'reset' });
$('fontUp').onclick = () => setFont(fontSize + 4);
$('fontDown').onclick = () => setFont(fontSize - 4);
$('mirror').onclick = () => setMirror(!mirror);
$('hide').onclick = () => api.prompterToggle(false);

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === ' ') handle({ type: 'toggle' });
  else if (k === 'ArrowUp') handle({ type: 'faster' });
  else if (k === 'ArrowDown') handle({ type: 'slower' });
  else if (k === 'Home') handle({ type: 'reset' });
  else if (k === 'PageDown') handle({ type: 'jump', dir: 1 });
  else if (k === 'PageUp') handle({ type: 'jump', dir: -1 });
  else if (k === '+' || k === '=') setFont(fontSize + 4);
  else if (k === '-') setFont(fontSize - 4);
  else if (k === 'm' || k === 'M') setMirror(!mirror);
  else if (k === 'o' || k === 'O') api.openText();
  else return;
  e.preventDefault();
});

// roda do mouse: rola manualmente; Ctrl+roda: tamanho da fonte
window.addEventListener('wheel', (e) => {
  if (e.ctrlKey) setFont(fontSize + (e.deltaY < 0 ? 2 : -2));
  else setPos(pos + e.deltaY * 0.6, true);
  e.preventDefault();
}, { passive: false });

// arrastar arquivo para a janela
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const f = e.dataTransfer.files[0];
  if (!f) return;
  // só roteiros de texto (evita carregar imagem, .exe etc.) e de tamanho razoável
  if (!/\.(txt|md|markdown)$/i.test(f.name) || f.size > 1024 * 1024) {
    showNotice(I18N.t('p.badFile'));
    return;
  }
  load(f.name, await f.text());
});

let noticeTimer = null;
function showNotice(text) {
  const el = $('countdown');
  el.textContent = text;
  el.classList.add('show', 'notice');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.remove('show', 'notice'), 2500);
}

window.addEventListener('resize', () => setPos(pos));

// gancho para testes automatizados (usa um áudio no lugar do microfone).
// Só existe quando o app é aberto com RECORDPLEASE_TEST=1.
if (api.testMode) {
  window.__tpTest = { setStream(s) { testStream = s; return applyVoice(true); }, engine, get follow() { return follow; }, get words() { return words; } };
}

// ------------------------------------------------------------------ init
// idioma: aplica um palpite pelo idioma do sistema na hora (sem "piscar") e confirma com a configuração do app
I18N.setLang('auto', navigator.language);
I18N.apply(document);
api.getUiLang().then((lang) => { I18N.setLang(lang); I18N.apply(document); updateMicDot(); });
api.on('ui:lang', (lang) => { I18N.setLang(lang); I18N.apply(document); updateMicDot(); });

document.documentElement.style.setProperty('--font', fontSize + 'px');
$('speed').textContent = speed;
setMirror(mirror);
if (scriptText) render(fileName, scriptText);
apply();
sendState(true);
requestAnimationFrame(frame);
