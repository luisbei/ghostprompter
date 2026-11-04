/* global Vosk */
// Motor de voz do teleprompter:
//  - detecção de fala (VAD) por energia com piso de ruído adaptativo -> onSpeaking(bool)
//  - reconhecimento offline (Vosk) -> onWords(palavrasNormalizadas)
//  - alinhamento das palavras reconhecidas com o roteiro (ScriptAligner)
(function () {
  // ------------------------------------------------------------ texto
  function norm(w) {
    return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñç]/g, '');
  }

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // peso de uma correspondência entre palavra falada (h) e do roteiro (s); 0 = não bate
  function wordMatch(h, s) {
    if (!h || !s) return 0;
    const w = s.length <= 2 ? 0.35 : s.length <= 3 ? 0.6 : 1;
    if (h === s) return w;
    if (s.length >= 4 && h.length >= 3) {
      const d = lev(h, s, 2);
      if (d <= 1 || (s.length >= 7 && d <= 2)) return w * 0.85;
      if (s.length >= 6 && h.length >= 5 && (s.startsWith(h) || h.startsWith(s))) return w * 0.7;
    }
    return 0;
  }

  // ------------------------------------------------------------ detecção de idioma
  const STOP = {
    pt: 'não você vocês é um uma os as do da dos das em no na nos nas muito também isso essa esse está são eu nós mas com para pelo pela ao aos então agora'.split(' '),
    es: 'el la los las y es un una del al lo por pero muy también esto esta está son yo nosotros usted ustedes con para entonces ahora qué'.split(' '),
    en: 'the and is to of a in that it you for with this are we i on be have not our your will can what so now'.split(' '),
  };
  const STOPN = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.map(norm))]));
  function detectLang(text) {
    const words = text.split(/\s+/).map((w) => w.toLowerCase().replace(/[^\p{L}]/gu, '')).filter(Boolean).slice(0, 3000);
    const score = { pt: 0, es: 0, en: 0 };
    for (const w of words) for (const k of Object.keys(STOP)) if (STOP[k].includes(w)) score[k]++;
    // acentos característicos
    score.pt += (text.match(/[ãõ]|ção|ções/g) || []).length * 2;
    score.es += (text.match(/ñ|¿|¡|ción\b/g) || []).length * 2;
    const best = Object.keys(score).sort((a, b) => score[b] - score[a])[0];
    return score[best] > 0 ? best : 'pt';
  }

  // ------------------------------------------------------------ alinhador
  class ScriptAligner {
    constructor(words) {
      this.words = words; // [{ n: 'normalizada' }]
      this.cur = -1;      // índice da última palavra lida
    }
    // hyp: últimas palavras reconhecidas (normalizadas). Retorna novo índice ou null.
    update(hyp) {
      const H = hyp.filter(Boolean).slice(-8);
      const N = this.words.length;
      if (H.length < 2 || !N) return null;
      const from = Math.max(0, this.cur - 10);
      const to = Math.min(N - 1, this.cur + 45);
      let best = null;
      for (let j = from; j <= to; j++) {
        // a palavra j do roteiro precisa bater com uma das 2 últimas faladas (âncora)
        const sj = this.words[j].n;
        if (!wordMatch(H[H.length - 1], sj) && !wordMatch(H[H.length - 2], sj)) continue;
        const lo = Math.max(0, j - H.length - 3);
        const S = this.words.slice(lo, j + 1).map((w) => w.n);
        const score = this.lcs(H, S);
        const dist = j - this.cur;
        const penalty = dist < 0 ? 0.25 * -dist : 0.012 * dist;
        const total = score - penalty;
        if (!best || total > best.total) best = { j, score, total };
      }
      if (!best) return null;
      const need = best.j < this.cur ? 3.2 : best.j - this.cur > 12 ? 2.6 : 1.8;
      if (best.score < need) return null;
      if (best.j === this.cur) return null;
      this.cur = best.j;
      return best.j;
    }
    lcs(H, S) {
      const m = H.length;
      const n = S.length;
      const dp = Array.from({ length: m + 1 }, () => new Float32Array(n + 1));
      for (let i = 1; i <= m; i++) {
        for (let k = 1; k <= n; k++) {
          const w = wordMatch(H[i - 1], S[k - 1]);
          dp[i][k] = Math.max(dp[i - 1][k], dp[i][k - 1], w ? dp[i - 1][k - 1] + w : 0);
        }
      }
      return dp[m][n];
    }
  }

  // ------------------------------------------------------------ motor
  class VoiceEngine {
    constructor({ onSpeaking, onWords, onStatus }) {
      this.onSpeaking = onSpeaking || (() => {});
      this.onWords = onWords || (() => {});
      this.onStatus = onStatus || (() => {});
      this.speaking = false;
      this.level = -100;
      this.history = [];
      this.models = new Map(); // url -> Promise<Model>
    }

    async start({ stream, micId, modelUrl }) {
      await this.stop();
      const token = (this.token = Symbol('run'));
      const s = stream || await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          deviceId: micId && micId !== 'default' ? { exact: micId } : undefined,
          echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1,
        },
      });
      // se outra chamada começou enquanto esperávamos o microfone, solta este para não ficar aberto
      if (token !== this.token) { if (!stream) s.getTracks().forEach((t) => t.stop()); return; }
      this.ownStream = !stream;
      this.stream = s;
      const ctx = (this.ctx = new AudioContext());
      const src = ctx.createMediaStreamSource(this.stream);

      // VAD
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      let floor = -60;
      let above = 0;
      let lastVoice = 0;
      this.vadTimer = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);
        this.level = db;
        // piso de ruído: cai rápido, sobe devagar
        floor = db < floor ? floor + (db - floor) * 0.3 : floor + 0.04;
        floor = Math.max(-90, Math.min(floor, -25));
        const now = performance.now();
        const voiced = db > Math.max(floor + 11, -58);
        above = voiced ? above + 1 : 0;
        if (above >= 2) lastVoice = now; // ~80 ms de fala contínua
        const speaking = now - lastVoice < 650;
        if (speaking !== this.speaking) { this.speaking = speaking; this.onSpeaking(speaking); }
      }, 40);

      // Reconhecimento
      if (modelUrl) {
        this.onStatus({ state: 'loading' });
        try {
          if (!this.models.has(modelUrl)) this.models.set(modelUrl, Vosk.createModel(modelUrl, -1));
          const model = await this.models.get(modelUrl);
          if (token !== this.token) return;
          const rec = (this.recognizer = new model.KaldiRecognizer(ctx.sampleRate));
          rec.on('partialresult', (m) => this.emit(m.result.partial, false));
          rec.on('result', (m) => this.emit(m.result.text, true));
          const proc = ctx.createScriptProcessor(4096, 1, 1);
          proc.onaudioprocess = (e) => { try { rec.acceptWaveform(e.inputBuffer); } catch {} };
          const mute = ctx.createGain();
          mute.gain.value = 0;
          src.connect(proc);
          proc.connect(mute);
          mute.connect(ctx.destination);
          this.proc = proc;
          this.onStatus({ state: 'listening' });
        } catch (e) {
          this.models.delete(modelUrl);
          this.onStatus({ state: 'error', error: String(e && e.message || e) });
        }
      } else {
        this.onStatus({ state: 'vad' });
      }
    }

    emit(text, final) {
      const words = (text || '').split(/\s+/).map(norm).filter(Boolean);
      if (!words.length) return;
      const hyp = this.history.concat(words);
      if (final) this.history = hyp.slice(-12);
      this.onWords(hyp.slice(-10), final);
    }

    async stop() {
      this.token = null;
      clearInterval(this.vadTimer);
      try { this.proc?.disconnect(); } catch {}
      try { this.recognizer?.remove(); } catch {}
      this.recognizer = null;
      this.proc = null;
      if (this.ownStream) this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      try { await this.ctx?.close(); } catch {}
      this.ctx = null;
      this.history = [];
      if (this.speaking) { this.speaking = false; this.onSpeaking(false); }
    }
  }

  window.Voice = { VoiceEngine, ScriptAligner, norm, detectLang };
})();
