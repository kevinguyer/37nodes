/* Tests for the pure search-language module (src/js/04b-query.js).

   The app itself has no test suite — it is checked by driving the browser —
   but this module takes strings in and gives plain data out, with no DOM or
   store, so it can be exercised on its own and its grammar cannot drift
   unnoticed. It is the most regression-prone logic in the app.

   Run:  node tests/query.test.js
   Exits non-zero on any failure. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'src', 'js', '04b-query.js');
const ctx = {};
vm.createContext(ctx);
// the module is a plain script (function declarations): load it, then export
vm.runInContext(fs.readFileSync(file, 'utf8') + `
  ;this.api = { queryTokens, parseQuery, queryGroupMatches, queryMarkRanges,
                queryToggleTag, queryIsOnlyTag, queryIsOnlyLinks, queryQuote,
                lowerWithMap, lowerSpanBack };`, ctx);
const A = ctx.api;

let failed = 0, ran = 0;
function eq(name, got, want) {
  ran++;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failed++; console.log('FAIL', name, '\n  got ', g, '\n  want', w); }
}

/* a query's groups as readable strings: [-]kind:value per term */
const shape = q => A.parseQuery(q).groups
  .map(g => g.map(t => (t.neg ? '-' : '') + t.kind + ':' + t.v));
/* an item as computeFilter builds it: title and note already lowercased */
const item = (title, note = '', flags = {}) => ({
  id: flags.id || 'i', title: title.toLowerCase(), note: note.toLowerCase(),
  starred: !!flags.starred, completed: !!flags.completed,
});
const match = (q, it, group = 0) => A.queryGroupMatches(A.parseQuery(q).groups[group], it);

/* --- terms ------------------------------------------------------------- */
eq('words are ANDed terms', shape('foo bar'), [['text:foo', 'text:bar']]);
eq('quoted phrase', shape('"foo bar" baz'), [['text:foo bar', 'text:baz']]);
eq('unterminated quote runs to the end', shape('"foo bar'), [['text:foo bar']]);
eq('empty phrase is dropped', shape('""'), []);
eq('blank query', shape('   '), []);
eq('tag, lowercased', shape('#ToDo'), [['tag:#todo']]);
eq('hash alone is text', shape('#'), [['text:#']]);
eq('flags', shape('is:starred IS:Done'), [['flag:starred', 'flag:completed']]);
eq('unknown operator stays text', shape('is:nonsense 10:30'), [['text:is:nonsense', 'text:10:30']]);

/* --- negation ---------------------------------------------------------- */
eq('negated word', shape('-draft'), [['-text:draft']]);
eq('negated tag', shape('-#later x'), [['-tag:#later', 'text:x']]);
eq('negated flag', shape('-is:done'), [['-flag:completed']]);
eq('negated phrase', shape('-"to do"'), [['-text:to do']]);
eq('lone dash is text', shape('- x'), [['text:-', 'text:x']]);
eq('-5 negates 5', shape('-5'), [['-text:5']]);
eq('quoted "-5" is literal', shape('"-5"'), [['text:-5']]);

/* --- scope: the standalone ">" ----------------------------------------- */
eq('chain of groups', shape('acme > launch > #urgent'), [['text:acme'], ['text:launch'], ['tag:#urgent']]);
eq('a>b is one word', shape('a>b'), [['text:a>b']]);
eq('trailing > is dropped', shape('acme >'), [['text:acme']]);
eq('leading > is dropped', shape('> acme'), [['text:acme']]);
eq('only > means nothing', shape('>'), []);
eq('-> is a word, not a separator', shape('a -> b'), [['text:a', 'text:->', 'text:b']]);

/* --- links: ------------------------------------------------------------ */
eq('links quoted', shape('links:"My Project" x'), [['links:my project', 'text:x']]);
eq('links bare', shape('links:acme'), [['links:acme']]);
eq('links negated', shape('-links:"a b"'), [['-links:a b']]);
eq('links prefix is case-insensitive', shape('LINKS:"A"'), [['links:a']]);
eq('links with no value is text', shape('links: x'), [['text:links:', 'text:x']]);
eq('links with empty quotes is dropped', shape('links:"" x'), [['text:x']]);
eq('links inside a scope', shape('links:"a" > #t'), [['links:a'], ['tag:#t']]);
eq('links between words', shape('foo links:"a b" bar'), [['text:foo', 'links:a b', 'text:bar']]);

/* --- quote escapes ----------------------------------------------------- */
eq('escaped quote', shape('"say \\"hi\\""'), [['text:say "hi"']]);
eq('escaped backslash', shape('"a\\\\b"'), [['text:a\\b']]);
eq('other backslashes are literal', shape('"c:\\dir"'), [['text:c:\\dir']]);
eq('queryQuote escapes', A.queryQuote('a"b'), '"a\\"b"');
eq('queryQuote round trip', shape('links:' + A.queryQuote('The "best" \\ one')), [['links:the "best" \\ one']]);

/* --- matching ---------------------------------------------------------- */
eq('words match across title and note', match('budget q3', item('Budget plan', 'due in Q3')), true);
eq('all words must match', match('budget q3', item('Budget plan', 'later')), false);
eq('tag is whole-tag', match('#todo', item('x #todos')), false);
eq('tag matches', match('#todo', item('x #todo')), true);
eq('tag in note', match('#todo', item('x', 'see #todo.')), true);
eq('negation holds', match('-draft', item('final')), true);
eq('negation fails', match('-draft', item('draft one')), false);
eq('is:starred', match('is:starred', item('a', '', { starred: true })), true);
eq('-is:starred', match('-is:starred', item('a', '', { starred: true })), false);
eq('is:done', match('is:done', item('a', '', { completed: true })), true);
eq('phrase keeps spacing', match('"foo bar"', item('foo  bar')), false);
{
  const g = A.parseQuery('links:"a"').groups;
  g[0][0].ids = new Set(['x']);
  eq('links match by id', A.queryGroupMatches(g[0], item('', '', { id: 'x' })), true);
  eq('links miss', A.queryGroupMatches(g[0], item('', '', { id: 'y' })), false);
  const n = A.parseQuery('-links:"a"').groups;
  n[0][0].ids = new Set(['x']);
  eq('negated links, other item', A.queryGroupMatches(n[0], item('', '', { id: 'y' })), true);
  eq('negated links, linked item', A.queryGroupMatches(n[0], item('', '', { id: 'x' })), false);
  const u = A.parseQuery('links:"nobody"').groups; // unresolved: ids never set
  eq('unresolved links match nothing', A.queryGroupMatches(u[0], item('', '', { id: 'x' })), false);
}

/* --- highlighting data ------------------------------------------------- */
eq('marks are positive text only', A.parseQuery('foo -bar #t "a b" is:done').marks, ['foo', 'a b']);
eq('tags are positive tags only', [...A.parseQuery('#A -#b').tags], ['#a']);
eq('ranges merge overlaps', A.queryMarkRanges('Foobar foo', ['foo', 'oba']), [[0, 5], [7, 10]]);
eq('ranges merge neighbours', A.queryMarkRanges('abcd', ['ab', 'cd']), [[0, 4]]);
eq('ranges unchanged by case', A.queryMarkRanges('Hello hello', ['hello']), [[0, 5], [6, 11]]);
// U+0130 lowercases to two units: ranges must still land on the original text
eq('ranges after dotted I', A.queryMarkRanges('x\u0130y z', ['y']), [[2, 3]]);
eq('ranges around dotted I', A.queryMarkRanges('\u0130 \u0130', ['\u0130'.toLowerCase()]), [[0, 1], [2, 3]]);
eq('no map when lengths agree', A.lowerWithMap('ab').map, null);

/* --- tag toggling and "is the whole query" ----------------------------- */
eq('toggle adds', A.queryToggleTag('foo', '#x'), 'foo #x');
eq('toggle adds to empty', A.queryToggleTag('  ', '#x'), '#x');
eq('toggle removes, keeps the rest', A.queryToggleTag('foo #x "a b" > #y', '#X'), 'foo "a b" > #y');
eq('toggle ignores a negated tag', A.queryToggleTag('-#x', '#x'), '-#x #x');
eq('toggle leaves links alone', A.queryToggleTag('links:"a b" #x', '#x'), 'links:"a b"');
eq('only-tag, spaces and case', A.queryIsOnlyTag(' #x ', '#X'), true);
eq('only-tag, with company', A.queryIsOnlyTag('#x foo', '#x'), false);
eq('only-links', A.queryIsOnlyLinks(' links:"My Project" ', 'my project'), true);
eq('only-links, with company', A.queryIsOnlyLinks('links:"a" foo', 'a'), false);

console.log(failed ? `${failed} of ${ran} FAILED` : `all ${ran} passed`);
process.exit(failed ? 1 : 0);
