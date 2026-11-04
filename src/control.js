/* global api */
const $ = (id) => document.getElementById(id);

let settings = {};
let sources = [];
let camStream = null;
let micStream = null;
let meter = null;          // { ctx, raf }
let rec = null;            // sessão de gravação ativa
let prompterPlaying = false; // último estado de rolagem informado pelo prompter

const LOCK_WHILE_REC = ['screenSel', 'refreshSrc', 'fps', 'sysAudio', 'camOn', 'camSel', 'camMode', 'micOn', 'micSel',
  'chooseDir'];

const t = (k, v) => I18N.t(k, v);
let lastStatus = { key: 'status.ready', vars: null, cls: '' };
function setStatus(text, cls = '') {
  const s = $('status');
  s.textContent = text;
  s.className = 'status ' + cls;
}
// mostra uma mensagem pela chave de tradução (assim ela muda junto quando o idioma é trocado)
// tira o prefixo técnico "Error invoking remote method '...': Error:" das mensagens que vêm do processo principal
const cleanMsg = (m) => String(m || '').replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, '');
function st(key, vars, cls = '') {
  if (vars && vars.msg) vars = { ...vars, msg: cleanMsg(vars.msg) };
  lastStatus = { key, vars, cls };
  setStatus(t(key, vars), cls);
}
const stopStream = (s) => s?.getTracks().forEach((t) => t.stop());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (patch) => { Object.assign(settings, patch); api.setSettings(patch); };

// ------------------------------------------------------------------ fontes de tela
async function refreshSources() {
  const sel = $('screenSel');
  const prev = sel.value || settings.screenId;
  sources = await api.getSources();
  sel.innerHTML = '';
  const groups = [[t('group.screens'), sources.filter((s) => s.isScreen)], [t('group.windows'), sources.filter((s) => !s.isScreen)]];
  let n = 0;
  for (const [label, list] of groups) {
    if (!list.length) continue;
    const g = document.createElement('optgroup');
    g.label = label;
    for (const s of list) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.isScreen ? t('screen.n', { n: ++n }) + (/^screen/i.test(s.name) || /entire/i.test(s.name) ? '' : ` — ${s.name}`) : s.name;
      g.appendChild(o);
    }
    sel.appendChild(g);
  }
  if (prev && sources.some((s) => s.id === prev)) sel.value = prev;
  updateThumb();
}
function updateThumb() {
  const s = sources.find((x) => x.id === $('screenSel').value);
  $('screenThumb').src = s?.thumb || '';
}

// ------------------------------------------------------------------ dispositivos
function fillSelect(sel, devices, savedId, fallbackKey) {
  const prev = sel.value || savedId;
  sel.innerHTML = '';
  devices.forEach((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId;
    o.textContent = d.label || t(fallbackKey, { n: i + 1 });
    sel.appendChild(o);
  });
  if (!devices.length) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = t('device.none');
    sel.appendChild(o);
  }
  if (prev && devices.some((d) => d.deviceId === prev)) sel.value = prev;
}

async function refreshDevices() {
  if (rec) return;
  let devs = await navigator.mediaDevices.enumerateDevices();
  // Só liga um dispositivo para descobrir os nomes se for preciso (nomes vazios) e se ele estiver
  // ativado no painel — câmera ou microfone desativados nunca são ligados, nem por um instante.
  const needVideo = $('camOn').checked && devs.some((d) => d.kind === 'videoinput' && !d.label);
  const needAudio = $('micOn').checked && devs.some((d) => d.kind === 'audioinput' && !d.label);
  if (needVideo || needAudio) {
    try { stopStream(await navigator.mediaDevices.getUserMedia({ audio: needAudio, video: needVideo })); } catch {}
    devs = await navigator.mediaDevices.enumerateDevices();
  }
  fillSelect($('camSel'), devs.filter((d) => d.kind === 'videoinput'), settings.camId, 'device.camera');
  fillSelect($('micSel'), devs.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications'), settings.micId, 'device.mic');
  await startCam();
  sendCamConfig();
  await startMic();
}

const camMode = () => $('camMode').value;
const overlayOn = () => $('camOn').checked && camMode() !== 'files';
const camFileOn = () => $('camOn').checked && camMode() !== 'overlay';

function sendCamConfig() {
  const show = overlayOn();
  $('overlayOpts').style.display = show ? '' : 'none';
  const src = sources.find((s) => s.id === $('screenSel').value);
  $('overlayHint').textContent = !show ? ''
    : src && !src.isScreen
      ? t('overlay.window')
      : t('overlay.hint');
  api.camConfig({
    visible: show && !!$('camSel').value,
    deviceId: $('camSel').value,
    shape: $('camShape').value,
    mirror: $('camMirror').checked,
  });
}

// Cada chamada recebe uma "geração". Se outra chamada começar enquanto esta espera o dispositivo,
// a resposta antiga é descartada e o dispositivo dela é desligado (não fica câmera/microfone ligado).
let camGen = 0;
let micGen = 0;

async function startCam() {
  const gen = ++camGen;
  stopStream(camStream);
  camStream = null;
  $('camPreview').srcObject = null;
  const id = $('camSel').value;
  $('camSel').disabled = !$('camOn').checked;
  if (!$('camOn').checked || !id) return;
  // a câmera às vezes demora a ser liberada pelo driver: tenta algumas vezes
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      });
      if (gen !== camGen) { stopStream(s); return; }
      camStream = s;
      $('camPreview').srcObject = s;
      if (lastStatus.key === 'st.camUnavailable') st('status.ready');
      return;
    } catch (e) {
      if (gen !== camGen) return;
      if (attempt === 4) st('st.camUnavailable', { msg: e.message }, 'err');
      else await sleep(700 * attempt);
      if (gen !== camGen) return;
    }
  }
}

async function startMic() {
  const gen = ++micGen;
  stopStream(micStream);
  micStream = null;
  if (meter) { cancelAnimationFrame(meter.raf); meter.ctx.close(); meter = null; }
  $('micLevel').style.width = '0';
  const id = $('micSel').value;
  $('micSel').disabled = !$('micOn').checked;
  if (!$('micOn').checked || !id) return;
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
    });
    if (gen !== micGen) { stopStream(s); return; }
    micStream = s;
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(micStream).connect(an);
    const buf = new Float32Array(an.fftSize);
    meter = { ctx, raf: 0 };
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8);
      $('micLevel').style.width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) + '%';
      meter.raf = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    if (gen === micGen) st('st.micUnavailable', { msg: e.message }, 'err');
  }
}

// ------------------------------------------------------------------ gravação
// MP4 (H.264 + AAC) direto do gravador do Chromium; WebM só se o MP4 não estiver disponível.
function pickMime() {
  const cands = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mime = cands.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

const MAX_PENDING = 256 * 1024 * 1024; // dados esperando para ir ao disco antes de considerar o disco lento demais

// Prepara um gravador ligado a um arquivo (abre o arquivo e cria o gravador, mas ainda não começa).
// - Se algo falhar depois de abrir o arquivo, ele é fechado aqui mesmo (não fica arquivo aberto sem dono).
// - onFail é chamado NA HORA se o disco recusar dados, se o disco não acompanhar ou se o gravador der erro.
async function prepareRecorder(stream, kind, videoBps, onFail) {
  const { mime, ext } = pickMime();
  const id = await api.recOpen(kind, ext);
  let mr;
  try {
    // quadro-chave a cada 2 s: sem isso o MP4 de uma tela parada (slide) só é entregue no fim, tudo na memória
    mr = new MediaRecorder(stream, {
      mimeType: mime, videoBitsPerSecond: videoBps, audioBitsPerSecond: 192000, videoKeyFrameIntervalDuration: 2000,
    });
  } catch (e) {
    await api.recClose(id).catch(() => {});
    throw e;
  }
  let chain = Promise.resolve();
  let failed = null;
  let pending = 0;
  const fail = (err) => { if (!failed) { failed = err; onFail(err); } };
  let lastData = 0;
  mr.ondataavailable = (e) => {
    if (!e.data || !e.data.size || failed) return;
    if (e.data.size > 1024) lastData = performance.now();
    pending += e.data.size;
    if (pending > MAX_PENDING) { fail(new Error(t('err.slowDisk'))); return; }
    const blob = e.data;
    chain = chain.then(async () => {
      if (failed) return;
      try { await api.recChunk(id, new Uint8Array(await blob.arrayBuffer())); } catch (err) { fail(err); }
      pending -= blob.size;
    });
  };
  mr.onerror = (e) => fail(e.error || new Error('MediaRecorder'));
  const stopped = new Promise((res) => { mr.onstop = res; });
  let watchdog = null;
  return {
    mr,
    start() {
      mr.start(1000);
      lastData = performance.now();
      // segurança: se o gravador passar 20 s sem entregar dados (eles estariam se acumulando na memória),
      // a gravação é finalizada e salva em vez de arriscar perder tudo
      watchdog = setInterval(() => {
        if (mr.state === 'recording' && performance.now() - lastData > 20000) fail(new Error(t('err.noData')));
        if (mr.state === 'paused') lastData = performance.now();
      }, 5000);
    },
    async finish() {
      clearInterval(watchdog);
      if (mr.state !== 'inactive') mr.stop();
      await stopped;
      await chain;
      return api.recClose(id); // devolve o arquivo salvo (mesmo se a gravação foi interrompida)
    },
  };
}

function lockUi(on) {
  document.body.classList.toggle('recording', on);
  for (const id of LOCK_WHILE_REC) $(id).disabled = on;
  if (!on) { $('camSel').disabled = !$('camOn').checked; $('micSel').disabled = !$('micOn').checked; }
  $('recBtn').textContent = t(on ? 'rec.stop' : 'rec.start');
  $('recBtn').classList.toggle('on', on);
  $('pauseBtn').disabled = !on;
  $('pauseBtn').textContent = t('rec.pause');
}

async function getScreenStream(srcId, fps, withSystemAudio) {
  const video = {
    mandatory: {
      chromeMediaSource: 'desktop', chromeMediaSourceId: srcId,
      maxWidth: 3840, maxHeight: 2160, maxFrameRate: fps, minFrameRate: Math.min(15, fps),
    },
  };
  if (withSystemAudio) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video });
    } catch {
      st('st.noSysAudio', null, 'err');
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: false, video });
}

// Cada gravação é um objeto "sessão" próprio. Depois de cada espera (captura, contagem, abrir arquivo)
// a sessão confere se ainda é a atual e se não foi cancelada; se foi, ela mesma desfaz o que abriu.
// Parar sempre devolve a MESMA promessa de finalização, e o app só fecha depois que ela termina.
const CANCELLED = Symbol('cancelado');

async function startRecording() {
  if (rec) return;
  const srcId = $('screenSel').value;
  if (!srcId) { st('st.chooseScreen', null, 'err'); return; }
  const s = {
    phase: 'starting', cancelled: false, begun: false,
    recorders: [], streams: [], audioCtx: null, timer: null,
    stopPromise: null, onCancelled: null, wasScrolling: false,
  };
  rec = s;
  lockUi(true);
  $('result').textContent = '';
  const alive = () => { if (rec !== s || s.cancelled) throw CANCELLED; };

  try {
    const fps = Number($('fps').value) || 30;
    const screenStream = await getScreenStream(srcId, fps, $('sysAudio').checked);
    s.streams.push(screenStream);
    alive();

    // Mistura microfone + áudio do sistema num único track para o vídeo da tela
    const ac = new AudioContext();
    s.audioCtx = ac;
    const dest = ac.createMediaStreamDestination();
    let hasAudio = false;
    const useMic = $('micOn').checked && micStream;
    if (useMic) { ac.createMediaStreamSource(micStream).connect(dest); hasAudio = true; }
    if (screenStream.getAudioTracks().length) {
      ac.createMediaStreamSource(new MediaStream(screenStream.getAudioTracks())).connect(dest);
      hasAudio = true;
    }
    const screenRecStream = new MediaStream([
      ...screenStream.getVideoTracks(),
      ...(hasAudio ? dest.stream.getAudioTracks() : []),
    ]);
    // o áudio do arquivo da câmera passa pelo MESMO caminho (mesmo atraso) que o da tela: os dois ficam alinhados
    const camDest = ac.createMediaStreamDestination();
    if (useMic) ac.createMediaStreamSource(micStream).connect(camDest);

    // Contagem regressiva (mostrada também no prompter)
    if ($('countdown').checked) {
      api.prompterCmd({ type: 'countdown', seconds: 3 });
      for (let i = 3; i > 0; i--) {
        st('st.startingIn', { n: i }, 'rec');
        for (let k = 0; k < 10; k++) { await sleep(100); alive(); } // percebe o cancelamento rápido
      }
    }

    // a câmera é lida depois da contagem: se foi desligada nesse meio-tempo, não entra
    const camRecStream = camFileOn() && camStream && camStream.getVideoTracks().some((tr) => tr.readyState === 'live')
      ? new MediaStream([...camStream.getVideoTracks(), ...(useMic ? camDest.stream.getAudioTracks() : [])])
      : null;

    // qualquer falha durante a gravação (disco, gravador, dispositivo) finaliza e salva o que já foi gravado
    const fail = (err) => {
      if (rec === s && s.phase === 'recording' && !s.failure) { s.failure = err; stopRecording(); }
    };

    await api.recBegin();
    s.begun = true;
    alive();
    const { height } = screenStream.getVideoTracks()[0].getSettings();
    const screenBps = (height || 1080) > 1200 ? 16e6 : 8e6;
    // abre os dois arquivos primeiro e só então começa os dois gravadores juntos (mesmo instante)
    s.recorders.push(await prepareRecorder(screenRecStream, 'screen', fps > 30 ? screenBps * 1.5 : screenBps, fail));
    alive();
    if (camRecStream) { s.recorders.push(await prepareRecorder(camRecStream, 'camera', 6e6, fail)); alive(); }
    for (const r of s.recorders) r.start();

    screenStream.getVideoTracks()[0].addEventListener('ended', () => { if (rec === s) stopRecording(); });
    // microfone ou câmera desconectados no meio: avisa e salva em vez de seguir gravando sem eles
    const lost = () => fail(new Error(t('err.deviceLost')));
    if (useMic) micStream.getAudioTracks().forEach((tr) => tr.addEventListener('ended', lost, { once: true }));
    if (camRecStream) camStream.getVideoTracks().forEach((tr) => tr.addEventListener('ended', lost, { once: true }));

    if ($('autoScroll').checked) api.prompterCmd({ type: 'play' });

    s.phase = 'recording';
    s.startedAt = performance.now();
    s.pausedTotal = 0;
    s.pausedAt = null;
    s.timer = setInterval(() => updateTimer(s), 250);
    st('st.recording', null, 'rec');
  } catch (e) {
    await abortSession(s);
    if (e === CANCELLED) {
      if (!rec) st('st.cancelled');
    } else {
      console.error(e);
      st('st.startFailed', { msg: e.message }, 'err');
    }
    s.onCancelled?.();
  }
}

// Desfaz uma sessão que não chegou a gravar de verdade (cancelada ou com erro ao iniciar).
async function abortSession(s) {
  for (const r of s.recorders) { try { await r.finish(); } catch {} }
  if (s.begun) { try { await api.recEnd(); } catch {} }
  await releaseSession(s);
}

// Solta câmera de tela, áudio e timer da sessão e devolve a interface ao normal.
async function releaseSession(s) {
  clearInterval(s.timer);
  s.streams.forEach(stopStream);
  try { await s.audioCtx?.close(); } catch {}
  if (rec === s) { rec = null; lockUi(false); }
}

function updateTimer(s) {
  if (!s?.startedAt) return;
  const now = s.pausedAt ?? performance.now();
  const sec = Math.floor((now - s.startedAt - s.pausedTotal) / 1000);
  const p = (n) => String(n).padStart(2, '0');
  $('timer').textContent = `${p(Math.floor(sec / 3600))}:${p(Math.floor(sec / 60) % 60)}:${p(sec % 60)}`;
}

function togglePause() {
  const s = rec;
  if (!s || s.phase !== 'recording') return;
  if (s.pausedAt == null) {
    s.recorders.forEach((r) => r.mr.state === 'recording' && r.mr.pause());
    s.pausedAt = performance.now();
    s.wasScrolling = prompterPlaying; // para retomar a rolagem ao continuar
    api.prompterCmd({ type: 'pause' });
    $('pauseBtn').textContent = t('rec.resume');
    st('st.paused', null, 'err');
  } else {
    s.recorders.forEach((r) => r.mr.state === 'paused' && r.mr.resume());
    s.pausedTotal += performance.now() - s.pausedAt;
    s.pausedAt = null;
    if (s.wasScrolling) api.prompterCmd({ type: 'play' });
    $('pauseBtn').textContent = t('rec.pause');
    st('st.recording', null, 'rec');
  }
}

// Para (ou cancela) a sessão atual. Todas as chamadas recebem a mesma promessa.
function stopRecording() {
  const s = rec;
  if (!s) return Promise.resolve();
  if (s.stopPromise) return s.stopPromise;
  if (s.phase === 'starting') {
    // a própria rotina de início percebe o cancelamento e desfaz o que abriu
    s.cancelled = true;
    st('st.cancelling');
    s.stopPromise = new Promise((res) => { s.onCancelled = res; });
    return s.stopPromise;
  }
  s.stopPromise = finalizeSession(s);
  return s.stopPromise;
}

// Botão Gravar/Parar e atalho global:
// - nada acontecendo → grava; gravando ou contando → para/cancela;
// - cancelamento em andamento → grava de novo assim que ele terminar;
// - finalizando (salvando) → ignora o clique.
function toggleRecording() {
  const s = rec;
  if (!s) return startRecording();
  if (!s.stopPromise) return stopRecording();
  if (s.cancelled && !s.restartQueued) {
    s.restartQueued = true;
    return s.stopPromise.then(() => startRecording());
  }
  return s.stopPromise;
}

async function finalizeSession(s) {
  s.phase = 'stopping';
  clearInterval(s.timer);
  api.prompterCmd({ type: 'pause' });
  st('st.finishing');
  $('recBtn').disabled = true;
  $('pauseBtn').disabled = true;

  let results = [];
  let dir = null;
  try {
    results = await Promise.all(s.recorders.map((r) => r.finish().catch((e) => ({ error: e }))));
    dir = await api.recEnd();
  } catch (e) {
    console.error(e);
  } finally {
    await releaseSession(s);
    $('recBtn').disabled = false;
  }
  const failed = results.find((r) => r && r.error);
  results = results.filter((r) => r && r.file); // inclui arquivos salvos parcialmente
  // gravação interrompida (disco, dispositivo, suspensão): o aviso fica na tela até a próxima ação
  if (s.failure) st('st.interrupted', { msg: s.failure.message || s.failure }, 'err');
  else if (failed) st('st.finishFailed', { msg: failed.error.message || failed.error }, 'err');
  else st('st.saved', null, 'ok');
  if (!results.length) return;
  const ul = document.createElement('ul');
  for (const r of results) {
    const li = document.createElement('li');
    li.textContent = r.file.split(/[\\/]/).pop();
    ul.appendChild(li);
  }
  const a = document.createElement('a');
  a.textContent = t('openRecFolder');
  a.dataset.i18n = 'openRecFolder';
  a.onclick = () => api.openFolder(dir);
  $('result').replaceChildren(a, ul);
}

// ------------------------------------------------------------------ teleprompter
const LANG_LABEL = { pt: 'Português (BR)', es: 'Español', en: 'English (US)' };
let lastVoice = {};
let dlProgress = null; // { lang, pct, stage }

function sendVoiceConfig(force) {
  const mode = $('scrollMode').value;
  $('voiceOpts').style.display = mode === 'manual' ? 'none' : '';
  $('voiceLang').parentElement.parentElement.style.display = mode === 'follow' ? '' : 'none';
  api.prompterCmd({ type: 'voice', force, cfg: { mode, lang: $('voiceLang').value, micId: $('micSel').value || 'default' } });
}

function renderVoiceStatus() {
  const v = lastVoice;
  const btn = $('modelDl');
  btn.style.display = 'none';
  if (!v.mode || v.mode === 'manual') return;
  const lang = LANG_LABEL[v.lang] || v.lang;
  let text = '';
  if (dlProgress && dlProgress.stage !== 'done' && dlProgress.stage !== 'error') {
    const dl = LANG_LABEL[dlProgress.lang];
    text = dlProgress.stage === 'prepare' ? t('v.preparing', { lang: dl }) : t('v.downloading', { lang: dl, pct: dlProgress.pct });
  } else if (v.mode === 'vad') {
    text = t(v.speaking ? 'v.vadSpeaking' : 'v.vadWaiting');
  } else if (v.needModel) {
    text = t('v.needModel', { lang });
    btn.textContent = t('v.download');
    btn.style.display = '';
    if (dlProgress?.stage === 'error') text = t('v.dlFailed', { msg: dlProgress.error }) + ' ' + text;
  } else if (v.state === 'loading') {
    text = t('v.loading', { lang });
  } else if (v.state === 'error') {
    text = t('v.error', { msg: v.error });
  } else if (v.state === 'listening') {
    text = t(v.speaking ? 'v.following' : 'v.waiting', { lang });
  }
  $('voiceStatus').textContent = text;
}

let lastPrompter = { playing: false, speed: 40, fileName: '' };
let prompterVisible = true;

function onPrompterState(s) {
  lastPrompter = s;
  prompterPlaying = !!s.playing;
  $('tpPlay').textContent = t(s.playing ? 'tp.pause' : 'tp.play');
  $('tpSpeed').textContent = t('tp.speed', { n: s.speed });
  if (s.fileName) $('tpFile').textContent = '📄 ' + s.fileName + (s.progress != null ? ` — ${Math.round(s.progress * 100)}%` : '');
  if (s.voice) { lastVoice = s.voice; renderVoiceStatus(); }
}

// pasta de gravação + aviso se ela estiver numa pasta sincronizada com a nuvem
function showOutDir() {
  $('outDir').textContent = settings.outputDir;
  $('outDir').title = settings.outputDir;
  $('cloudWarn').style.display = settings.cloudSync ? '' : 'none';
  $('cloudWarn').textContent = settings.cloudSync ? t('cloud.warn', { name: settings.cloudSync }) : '';
  $('dataWarn').style.display = settings.legacyData ? '' : 'none';
  $('dataWarn').textContent = settings.legacyData ? t('data.legacy') : '';
}

function renderShortcuts() {
  $('shortcuts').textContent = (settings.shortcuts || [])
    .map((s) => `${s.acc ? s.acc.replace('PageUp', 'PgUp').replace('PageDown', 'PgDn').replace('Space', t('key.space'))
      .replace(/\bUp$/, '↑').replace(/\bDown$/, '↓') : t('sc.none')} ${t(s.key)}`)
    .join(' · ');
}

// Re-traduz tudo o que está na tela (chamado ao abrir e quando o idioma muda).
function relabel() {
  I18N.apply(document);
  showOutDir();
  st(lastStatus.key, lastStatus.vars, lastStatus.cls);
  renderShortcuts();
  if (!lastPrompter.fileName) $('tpFile').textContent = t('tp.none');
  onPrompterState(lastPrompter);
  $('tpShow').textContent = t(prompterVisible ? 'tp.hide' : 'tp.show');
  $('recBtn').textContent = t(rec ? 'rec.stop' : 'rec.start');
  $('pauseBtn').textContent = t(rec?.pausedAt != null ? 'rec.resume' : 'rec.pause');
  sendCamConfig();
  renderVoiceStatus();
}

// ------------------------------------------------------------------ init
async function init() {
  settings = await api.getSettings();

  showOutDir();
  $('fps').value = String(settings.fps || 30);
  $('sysAudio').checked = !!settings.sysAudio;
  $('camOn').checked = settings.camOn !== false;
  $('camMode').value = settings.camMode || 'files';
  $('scrollMode').value = settings.scrollMode || 'manual';
  $('voiceLang').value = settings.voiceLang || 'auto';
  $('camShape').value = settings.camShape || 'circle';
  $('camMirror').checked = settings.camMirror !== false;
  $('micOn').checked = settings.micOn !== false;
  $('autoScroll').checked = settings.autoScroll !== false;
  $('countdown').checked = settings.countdown !== false;
  $('hideControl').checked = settings.hideControl !== false;
  $('tpOpacity').value = settings.prompterOpacity ?? 0.85;
  $('rememberScript').checked = settings.rememberScript !== false;
  api.prompterCmd({ type: 'remember', value: $('rememberScript').checked });
  $('rememberScript').addEventListener('change', () => {
    save({ rememberScript: $('rememberScript').checked });
    api.prompterCmd({ type: 'remember', value: $('rememberScript').checked });
  });
  $('clearScript').addEventListener('click', () => {
    if (confirm(t('clearScript.confirm'))) {
      api.prompterCmd({ type: 'clearScript' });
      $('tpFile').textContent = t('tp.noneShort');
      lastPrompter = { ...lastPrompter, fileName: '' };
    }
  });
  // idioma da interface
  $('uiLang').value = settings.uiLang || 'auto';
  I18N.setLang(await api.getUiLang());
  relabel();
  $('uiLang').addEventListener('change', () => save({ uiLang: $('uiLang').value }));
  api.on('ui:lang', async (lang) => {
    I18N.setLang(lang);
    relabel();
    await refreshSources(); // nomes "Tela 1"/"Screen 1" na lista
  });

  // checkboxes simples que só precisam ser lembrados
  for (const id of ['sysAudio', 'autoScroll', 'countdown', 'hideControl']) {
    $(id).addEventListener('change', () => save({ [id]: $(id).checked }));
  }
  $('fps').addEventListener('change', () => save({ fps: Number($('fps').value) }));
  $('screenSel').addEventListener('change', () => { updateThumb(); save({ screenId: $('screenSel').value }); sendCamConfig(); });
  $('refreshSrc').addEventListener('click', refreshSources);
  $('camOn').addEventListener('change', async () => { save({ camOn: $('camOn').checked }); await startCam(); sendCamConfig(); });
  $('camSel').addEventListener('change', async () => { save({ camId: $('camSel').value }); await startCam(); sendCamConfig(); });
  $('camMode').addEventListener('change', () => { save({ camMode: camMode() }); sendCamConfig(); });
  $('camShape').addEventListener('change', () => { save({ camShape: $('camShape').value }); sendCamConfig(); });
  $('camMirror').addEventListener('change', () => { save({ camMirror: $('camMirror').checked }); sendCamConfig(); });
  $('micOn').addEventListener('change', () => { save({ micOn: $('micOn').checked }); startMic(); });
  $('micSel').addEventListener('change', () => { save({ micId: $('micSel').value }); startMic(); sendVoiceConfig(); });
  $('scrollMode').addEventListener('change', () => { save({ scrollMode: $('scrollMode').value }); sendVoiceConfig(); });
  $('voiceLang').addEventListener('change', () => { save({ voiceLang: $('voiceLang').value }); sendVoiceConfig(); });
  $('modelDl').addEventListener('click', async () => {
    const lang = lastVoice.lang;
    const info = await api.modelInfo(lang);
    if (!info) return;
    if (!confirm(t('v.confirm', { label: info.label, mb: info.sizeMB }))) return;
    dlProgress = { lang, pct: 0, stage: 'download' };
    renderVoiceStatus();
    const ok = await api.modelDownload(lang);
    if (ok) sendVoiceConfig(true);
  });
  api.on('model:progress', (p) => { dlProgress = p; renderVoiceStatus(); });

  $('chooseDir').addEventListener('click', async () => {
    const d = await api.chooseFolder();
    if (d) { settings = { ...settings, ...(await api.getSettings()) }; showOutDir(); }
  });
  $('openDir').addEventListener('click', () => api.openFolder());

  $('recBtn').addEventListener('click', () => toggleRecording());
  $('pauseBtn').addEventListener('click', togglePause);

  $('tpOpen').addEventListener('click', () => api.openText());
  $('tpShow').addEventListener('click', () => api.prompterToggle());
  $('tpPlay').addEventListener('click', () => api.prompterCmd({ type: 'toggle' }));
  $('tpFaster').addEventListener('click', () => api.prompterCmd({ type: 'faster' }));
  $('tpSlower').addEventListener('click', () => api.prompterCmd({ type: 'slower' }));
  $('tpReset').addEventListener('click', () => api.prompterCmd({ type: 'reset' }));
  $('tpOpacity').addEventListener('input', () => api.prompterOpacity($('tpOpacity').value));

  api.on('prompter:state', onPrompterState);
  api.on('prompter:visible', (v) => {
    prompterVisible = v;
    $('tpShow').textContent = t(v ? 'tp.hide' : 'tp.show');
  });
  // a janela flutuante da câmera foi fechada (ex.: Alt+F4): deixa de mostrar a câmera na tela
  api.on('cam:closed', async () => {
    if (camMode() === 'both') { $('camMode').value = 'files'; save({ camMode: 'files' }); }
    else if (camMode() === 'overlay') { $('camOn').checked = false; save({ camOn: false }); await startCam(); }
    sendCamConfig();
  });
  // o computador vai suspender: finaliza e salva a gravação, com aviso
  api.on('power:suspend', () => {
    if (rec && rec.phase === 'recording' && !rec.failure) { rec.failure = new Error(t('err.suspended')); stopRecording(); }
    else if (rec && rec.phase === 'starting') stopRecording();
  });
  api.on('rec:toggle', () => toggleRecording());
  api.on('app:stop-and-quit', async () => {
    try { await stopRecording(); } finally { api.quit(); }
  });

  let devTimer;
  navigator.mediaDevices.addEventListener('devicechange', () => {
    clearTimeout(devTimer);
    devTimer = setTimeout(refreshDevices, 600);
  });

  await refreshSources();
  await refreshDevices();
  sendVoiceConfig();
  api.prompterCmd({ type: 'ping' });
}

init().catch((e) => { console.error(e); st('st.error', { msg: e.message }, 'err'); });
