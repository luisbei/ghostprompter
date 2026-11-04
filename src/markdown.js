// Conversor Markdown mínimo, pensado para roteiros de teleprompter.
// Suporta: # títulos, **negrito**, *itálico*, listas, > citações, --- separadores.
// Trechos entre [colchetes] viram "deixas" destacadas, ex.: [PAUSA] [PRÓXIMO SLIDE].
(function () {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Todas as expressões abaixo NÃO deixam o símbolo de abertura aparecer dentro do trecho capturado
  // (ex.: [^\[\]] em vez de [^\]]). Assim cada tentativa para no próximo símbolo e o tempo cresce de
  // forma linear com o tamanho do texto — um roteiro com milhares de "[" sem "]" não trava o prompter.

  // Deixas (não são lidas em voz alta): [PRÓXIMO SLIDE] ou (próximo slide).
  // Parênteses só contam quando começam uma palavra, para não pegar "aluno(s)".
  function cues(s) {
    return s
      .replace(/\[([^\[\]\n]+)\](?!\()/g, '<span class="cue">[$1]</span>')
      .replace(/(^|[\s>—–-])\(([^()\n]+)\)/g, '$1<span class="cue">($2)</span>');
  }

  function inlineMd(s) {
    s = esc(s)
      .replace(/!\[[^\[\]]*\]\([^()]*\)/g, '')              // imagens
      .replace(/\[([^\[\]]+)\]\([^()]*\)/g, '$1')           // links -> texto
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>');
    return cues(s);
  }

  const inlineTxt = (s) => cues(esc(s));

  // separador (---, ***, ___ com ou sem espaços), verificado caractere a caractere
  function isRule(line) {
    const s = line.trim();
    if (s.length < 3 || !'-*_'.includes(s[0])) return false;
    let count = 0;
    for (const ch of s) {
      if (ch === s[0]) count++;
      else if (ch !== ' ' && ch !== '\t') return false;
    }
    return count >= 3;
  }

  function render(src, isMarkdown) {
    const inline = isMarkdown ? inlineMd : inlineTxt;
    let text = src.replace(/\r\n?/g, '\n');
    if (isMarkdown) text = text.replace(/^---\n[\s\S]*?\n---\n/, ''); // front-matter
    const out = [];
    let para = [];
    let list = null;

    const flush = () => {
      if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; }
      if (list) {
        out.push(`<${list.tag}>` + list.items.map((i) => '<li>' + inline(i) + '</li>').join('') + `</${list.tag}>`);
        list = null;
      }
    };

    for (const raw of text.split('\n')) {
      // trimEnd() em vez de /\s+$/: a expressão regular levava tempo quadrático com muitos espaços antes de um texto
      const line = raw.trimEnd();
      if (!line.trim()) { flush(); continue; }
      if (!isMarkdown) { para.push(line); continue; }

      let m;
      if ((m = /^\s{0,3}(#{1,6})\s+/.exec(line))) {
        // título: o resto da linha, sem os "#" de fechamento opcionais (feito sem regex, em tempo linear)
        flush();
        let body = line.slice(m[0].length);
        let end = body.length;
        while (end > 0 && body[end - 1] === '#') end--;
        if (end < body.length && (end === 0 || /\s/.test(body[end - 1]))) body = body.slice(0, end);
        const n = Math.min(m[1].length, 3);
        out.push(`<h${n}>${inline(body.trimEnd())}</h${n}>`);
      } else if (isRule(line)) {
        flush();
        out.push('<hr>');
      } else if ((m = line.match(/^\s*>\s?(.*)$/))) {
        flush();
        out.push('<blockquote>' + inline(m[1]) + '</blockquote>');
      } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
        if (para.length || (list && list.tag !== tag)) flush();
        list = list || { tag, items: [] };
        list.items.push(m[1]);
      } else if (list) {
        list.items[list.items.length - 1] += ' ' + line.trim(); // continuação do item
      } else {
        para.push(line);
      }
    }
    flush();
    return out.join('\n');
  }

  window.renderScript = render;
})();
