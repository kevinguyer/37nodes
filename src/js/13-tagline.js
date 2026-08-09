/* ===== 13 tagline =====
   The top-bar tagline changes once a minute. Each new line arrives as a
   cipher decode: every letter scrambles at 45 ms, then the flips slow down as
   each character nears its moment and lock in, with two or three holdouts
   dragging out to the end.

   The tagline element is rebuilt by renderCrumbs() on every render (and only
   exists at the root), so nothing here holds a reference to it: each frame
   re-reads the current node, and renderCrumbs hands new ones the frame in
   progress via taglineAdopt(). */

/* var, not let: renderCrumbs runs once during boot, before this module has
   executed. The hoisted `undefined` makes taglineAdopt() a no-op until then,
   so the brand line in the markup is what greets a fresh load. */
var taglineReady = false;

const TAGLINES = [
  BRAND_TAGLINE, // 'Infinite depth. Zero chaos.'
  'Every node is a whole and a part.',
  'A thought indented is a thought understood.',
  'Nest it now, find it later.',
  'One line at a time, all the way down.',
  'Zoom in until the work is small enough to do.',
  'Depth is not clutter when it collapses.',
  'Capture first. Arrange after.',
  'Indent to conquer.',
  'What is collapsed is not forgotten.',
  'Every item can hold a world.',
  'Structure is what survives the week.',
  'Big things are small things, arranged.',
  'The outline holds what the hour cannot.',
  'Nothing here ever leaves your machine.',
  'The keyboard is the whole instrument.',
  'A parent is only a child that grew.',
  'Sort the branch, not the forest.',
  'Collapse the world to the next single step.',
  'Ideas nest. Chaos does not.',
  'Write the branch before you climb it.',
  'Depth without dread.',
];

const CIPHER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!?<>/\\|{}[]~^';
const CIPHER_KEEP = ' .,;:\'"!?-()'; // punctuation holds still: the sentence keeps its shape
const CIPHER_TICK = 45;
const TAGLINE_ROTATE_MS = 60000;

let taglineText = BRAND_TAGLINE;  // the line we are settling on
let taglineShown = BRAND_TAGLINE; // what is on screen this frame (may be mid-decode)
let taglineIdx = TAGLINES.indexOf(BRAND_TAGLINE);
let cipherTimer = null;

const randCipherChar = () => CIPHER_CHARS[(Math.random() * CIPHER_CHARS.length) | 0];

function taglineNode() { return $('.tagline', crumbsEl); }
function taglinePaint() {
  const el = taglineNode();
  if (el) el.textContent = taglineShown;
}
function taglineAdopt(el) {
  if (taglineReady) el.textContent = taglineShown;
}
function taglinePick() {
  let i;
  do { i = (Math.random() * TAGLINES.length) | 0; } while (i === taglineIdx && TAGLINES.length > 1);
  taglineIdx = i;
  return TAGLINES[i];
}
function cipherStop() {
  if (cipherTimer) { clearInterval(cipherTimer); cipherTimer = null; }
}

function cipherDecode(target) {
  cipherStop();
  taglineText = target;
  const chars = [...target];
  const len = chars.length;
  const settled = new Array(len);
  const lockMs = new Array(len);  // when each character stops scrambling
  const flipAt = new Array(len).fill(0);
  const show = new Array(len);
  const loose = [];
  for (let i = 0; i < len; i++) {
    if (CIPHER_KEEP.includes(chars[i])) {
      settled[i] = true; show[i] = chars[i]; lockMs[i] = 0;
    } else {
      settled[i] = false;
      show[i] = randCipherChar();
      // exponential: most characters land inside the first second, with a tail
      lockMs[i] = Math.min(0.35 - Math.log(1 - Math.random() * 0.98) * 0.75, 3.2) * 1000;
      loose.push(i);
    }
  }
  // two or three holdouts drag out past everything else, so the line lands
  // one straggler at a time instead of all at once
  loose.sort(() => Math.random() - 0.5);
  const holdouts = Math.min(2 + ((Math.random() * 2) | 0), loose.length);
  for (let k = 0; k < holdouts; k++) lockMs[loose[k]] = (3.4 + Math.random() * 0.9) * 1000;

  taglineShown = show.join('');
  taglinePaint();

  /* Elapsed wall-clock, not a tick count: a background or throttled tab slows
     the frame rate, and the reveal should still finish in its four seconds
     rather than stretching to a minute. */
  const start = performance.now();
  cipherTimer = setInterval(() => {
    const t = performance.now() - start;
    let left = false;
    for (let i = 0; i < len; i++) {
      if (settled[i]) continue;
      if (t >= lockMs[i]) { settled[i] = true; show[i] = chars[i]; continue; }
      left = true;
      // flips slow as a character approaches its moment: every 45 ms at the
      // start, every ~225 ms by the end — the "settling" half of the effect
      if (t >= flipAt[i]) {
        show[i] = randCipherChar();
        flipAt[i] = t + CIPHER_TICK * (1 + 4 * (t / lockMs[i]));
      }
    }
    taglineShown = show.join('');
    taglinePaint();
    if (!left) { cipherStop(); taglineShown = taglineText; taglinePaint(); }
  }, CIPHER_TICK);
}

/* Decode only when there is something to watch: at the root, on screen, in a
   visible tab, with motion allowed (e-ink and prefers-reduced-motion set
   --motion to 0), and not behind the tour's scrim. Otherwise swap silently so
   the next look at the top bar is already a new line. */
function taglineRotate() {
  const next = taglinePick();
  const el = taglineNode();
  const motion = getComputedStyle(document.documentElement).getPropertyValue('--motion').trim() !== '0';
  if (!el || el.offsetParent === null || document.hidden || !motion || !tourEl.hidden) {
    cipherStop();
    taglineText = taglineShown = next;
    taglinePaint();
    return;
  }
  cipherDecode(next);
}

setInterval(taglineRotate, TAGLINE_ROTATE_MS);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && cipherTimer) { // don't scramble into a background tab
    cipherStop();
    taglineShown = taglineText;
    taglinePaint();
  }
});
taglineReady = true;
