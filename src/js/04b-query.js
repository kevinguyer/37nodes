/* ===== 04b query =====
   The search query language (F75–F77). Pure: strings in, plain data out — no
   DOM, no store — so it can be exercised on its own and its meaning cannot
   drift with the renderer. computeFilter (04) walks the tree with it.

   A query is whitespace-separated TERMS, ANDed per item:
     word        case-insensitive substring of title or note
     "a phrase"  the same, spaces literal (unterminated: runs to the end)
     #tag        a whole tag (F43), in title or note
     is:starred  / is:done — flags on the item's content
     links:"Title"  items linked to or from that item (F78); the title is
                 resolved like a [[link]], so it is matched by name
   Any term takes a leading "-" to negate it. A standalone ">" splits the
   query into GROUPS that must hold down a chain of ancestors (F76).
   Inside quotes, \" is a literal quote and \\ a literal backslash.

   The grammar is total: nothing is a syntax error. Text that only resembles
   syntax (10:30, is:nonsense, a>b, a lone "-") is a plain word. */

/* a quoted run starting at str[at] === '"' → { v, next }: the unescaped text
   and the index after the closing quote (or the end, if it never closes) */
function queryReadQuoted(str, at) {
  let v = '';
  let j = at + 1;
  for (; j < str.length && str[j] !== '"'; j++) {
    if (str[j] === '\\' && (str[j + 1] === '"' || str[j + 1] === '\\')) { v += str[j + 1]; j++; }
    else v += str[j];
  }
  return { v, next: j < str.length ? j + 1 : str.length };
}

/* a string as one quoted term, escaping what the reader above unescapes */
function queryQuote(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/* → [{start, end, neg, kind: 'text'|'tag'|'flag'|'links'|'sep', v}] with
   source spans, so a token can be cut back out of the string it came from */
function queryTokens(str) {
  const out = [];
  const n = str.length;
  const isSpace = ch => /\s/.test(ch);
  let i = 0;
  while (i < n) {
    if (isSpace(str[i])) { i++; continue; }
    const start = i;
    let neg = false;
    if (str[i] === '-' && i + 1 < n && !isSpace(str[i + 1])) { neg = true; i++; }
    if (str[i] === '"') {
      const q = queryReadQuoted(str, i);
      i = q.next;
      if (q.v) out.push({ start, end: i, neg, kind: 'text', v: q.v.toLowerCase() });
      continue;
    }
    // links:"A title" (or links:word): the value may be quoted, so it is read
    // here, before the bare-word scan would stop at its first space
    if (/^links:/i.test(str.slice(i, i + 6)) && i + 6 < n && !isSpace(str[i + 6])) {
      let v;
      if (str[i + 6] === '"') {
        const q = queryReadQuoted(str, i + 6);
        v = q.v;
        i = q.next;
      } else {
        let j = i + 6;
        while (j < n && !isSpace(str[j])) j++;
        v = str.slice(i + 6, j);
        i = j;
      }
      if (v.trim()) out.push({ start, end: i, neg, kind: 'links', v: v.trim().toLowerCase() });
      continue;
    }
    let j = i;
    while (j < n && !isSpace(str[j])) j++;
    const raw = str.slice(i, j);
    i = j;
    const low = raw.toLowerCase();
    if (raw === '>' && !neg) out.push({ start, end: i, neg: false, kind: 'sep', v: '>' });
    else if (raw === '>' && neg) out.push({ start, end: i, neg: false, kind: 'text', v: '->' });
    else if (/^#[\w-]+$/.test(raw)) out.push({ start, end: i, neg, kind: 'tag', v: low });
    else if (low === 'is:starred') out.push({ start, end: i, neg, kind: 'flag', v: 'starred' });
    else if (low === 'is:done') out.push({ start, end: i, neg, kind: 'flag', v: 'completed' });
    else out.push({ start, end: i, neg, kind: 'text', v: low });
  }
  return out;
}

/* → { groups: [[term, …], …], marks: [string], tags: Set<'#tag'> }
   `marks` and `tags` are the POSITIVE terms only — what to highlight.
   Empty groups are dropped, so a half-typed "acme >" reads as "acme". */
function parseQuery(str) {
  const groups = [];
  let cur = [];
  const marks = [];
  const tags = new Set();
  for (const t of queryTokens(String(str || ''))) {
    if (t.kind === 'sep') {
      if (cur.length) groups.push(cur);
      cur = [];
      continue;
    }
    const term = { neg: t.neg, kind: t.kind, v: t.v };
    if (t.kind === 'tag') {
      // whole tags only: #todo must not hit #todos (tag chars are [\w-])
      term.re = new RegExp('(^|\\s)' + t.v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'i');
    }
    cur.push(term);
    if (!t.neg) {
      if (t.kind === 'text') marks.push(t.v);
      else if (t.kind === 'tag') tags.add(t.v);
    }
  }
  if (cur.length) groups.push(cur);
  return { groups, marks, tags };
}

/* does one item satisfy every term of a group? `item` carries its id, the title
   and note ALREADY lowercased, and the two flags the operators read */
function queryGroupMatches(group, item) {
  for (const t of group) {
    let ok;
    if (t.kind === 'text') ok = item.title.includes(t.v) || item.note.includes(t.v);
    else if (t.kind === 'tag') ok = t.re.test(item.title) || t.re.test(item.note);
    else if (t.kind === 'links') ok = !!(t.ids && t.ids.has(item.id)); // ids: set by computeFilter
    else ok = !!item[t.v === 'starred' ? 'starred' : 'completed'];
    if (ok === t.neg) return false;
  }
  return true;
}

/* highlight ranges for a title: every occurrence of every needle, merged
   where they overlap or touch → [[start, end], …] in order */
function queryMarkRanges(text, needles) {
  const low = text.toLowerCase();
  const spans = [];
  for (const nd of needles) {
    if (!nd) continue;
    for (let at = low.indexOf(nd); at >= 0; at = low.indexOf(nd, at + nd.length)) {
      spans.push([at, at + nd.length]);
    }
  }
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged;
}

/* Shift+click on a tag chip: add the tag as a term, or take it back out if the
   query already has it (positive). Cuts by source span, so quotes, operators
   and `>` elsewhere in the query are left exactly as typed. */
function queryToggleTag(str, tag) {
  const want = tag.toLowerCase();
  const hits = queryTokens(str).filter(t => t.kind === 'tag' && !t.neg && t.v === want);
  if (!hits.length) return (str.trim() ? str.trim() + ' ' : '') + tag;
  let out = str;
  for (const t of hits.reverse()) out = out.slice(0, t.start) + out.slice(t.end);
  return out.replace(/\s{2,}/g, ' ').trim();
}

/* is the whole query exactly this one tag? (a plain chip click then clears) */
function queryIsOnlyTag(str, tag) {
  const p = parseQuery(str);
  return p.groups.length === 1 && p.groups[0].length === 1
    && p.groups[0][0].kind === 'tag' && !p.groups[0][0].neg
    && p.groups[0][0].v === tag.toLowerCase();
}

/* is the whole query exactly links:"title"? (the gesture then toggles off) */
function queryIsOnlyLinks(str, title) {
  const p = parseQuery(str);
  const t = p.groups.length === 1 && p.groups[0].length === 1 && p.groups[0][0];
  return !!t && t.kind === 'links' && !t.neg && t.v === String(title).trim().toLowerCase();
}
