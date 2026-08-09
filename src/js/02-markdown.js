/* ===== 02 markdown =====
   Small markdown subset rendered by DOM construction only —
   raw HTML in source is always displayed as literal text (XSS-safe).
   Blocks: headings (#..###), fenced code, quotes, bulleted + numbered lists,
   horizontal rules, paragraphs.
   Inline: code spans, links, bold, italic.                                  */

const SAFE_URL = /^(https?:|mailto:|#)/i;

const INLINE_PATTERNS = [
  { re: /`([^`]+)`/, make: m => {
      const c = document.createElement('code');
      c.textContent = m[1];
      return c;
    } },
  // [[wikilink]] before [md](link): "[[x]]" must never parse as a bracket pair
  { re: /\[\[([^\[\]]+)\]\]/, make: m => makeWikilink(m[1]) },
  { re: /\[([^\]]+)\]\(([^)\s]+)\)/, make: m => {
      const a = document.createElement('a');
      if (SAFE_URL.test(m[2])) {
        a.href = m[2];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      a.append(inlineFrag(m[1]));
      return a;
    } },
  { re: /\*\*([^*]+)\*\*/, make: m => {
      const b = document.createElement('strong');
      b.append(inlineFrag(m[1]));
      return b;
    } },
  { re: /\*([^*]+)\*/, make: m => {
      const em = document.createElement('em');
      em.append(inlineFrag(m[1]));
      return em;
    } },
  { re: /\b_([^_]+)_\b/, make: m => {
      const em = document.createElement('em');
      em.append(inlineFrag(m[1]));
      return em;
    } },
];

function inlineFrag(text) {
  const frag = document.createDocumentFragment();
  let rest = text;
  while (rest) {
    let best = null, bestIdx = Infinity, bestPat = null;
    for (const p of INLINE_PATTERNS) {
      const m = rest.match(p.re);
      if (m && m.index < bestIdx) { best = m; bestIdx = m.index; bestPat = p; }
    }
    if (!best) { frag.append(document.createTextNode(rest)); break; }
    if (bestIdx > 0) frag.append(document.createTextNode(rest.slice(0, bestIdx)));
    frag.append(bestPat.make(best));
    rest = rest.slice(bestIdx + best[0].length);
  }
  return frag;
}

function mdBuildList(items) {
  const base = items[0].indent;
  const list = document.createElement(items[0].ordered ? 'ol' : 'ul');
  let k = 0;
  while (k < items.length) {
    const it = items[k];
    k++;
    const li = document.createElement('li');
    li.append(inlineFrag(it.text));
    const sub = [];
    while (k < items.length && items[k].indent > base) { sub.push(items[k]); k++; }
    if (sub.length) li.append(mdBuildList(sub));
    list.append(li);
  }
  return list;
}

function mdRender(src) {
  const root = document.createElement('div');
  root.className = 'md';
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    let m;
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence (or EOF)
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = buf.join('\n');
      pre.append(code);
      root.append(pre);
      continue;
    }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      const h = document.createElement('h' + m[1].length);
      h.append(inlineFrag(m[2]));
      root.append(h);
      i++;
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      root.append(document.createElement('hr'));
      i++;
      continue;
    }
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      const bq = document.createElement('blockquote');
      bq.append(mdRender(buf.join('\n')));
      root.append(bq);
      continue;
    }
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i])) {
        const lm = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        items.push({ indent: lm[1].replace(/\t/g, '  ').length, ordered: /\d/.test(lm[2]), text: lm[3] });
        i++;
      }
      root.append(mdBuildList(items));
      continue;
    }
    // paragraph: gather until blank line or a block opener
    const buf = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i])
        && !/^(```|#{1,3}\s|>|\s*(?:[-*+]|\d+\.)\s)/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    const p = document.createElement('p');
    buf.forEach((l, j) => {
      if (j) p.append(document.createElement('br'));
      p.append(inlineFrag(l));
    });
    root.append(p);
  }
  return root;
}
