// Brand-colour extraction — what a customer sees as "that isn't my colour".
//
// The widget paints white content on this colour and builds its own alpha
// variants by string concatenation, so the two failure modes worth pinning
// are a value that isn't a 6-digit hex, and a value too pale to see anything
// on. Everything else is about preferring what a site DECLARES over what a
// language model infers from 8 KB of its HTML.
import {
  normalizeHexColor,
  isUsableBrandColor,
  brandColorFromHtml,
  mostUsedBrandColorInHtml
} from '../../api/chat/theme.js';

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`PASS: ${label}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${label} — ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

check('short and unprefixed hexes become the 6-digit form everything else assumes', () => {
  // `${color}66` (the widget's alpha trick) turns '#fff' into '#fff66'.
  assert(normalizeHexColor('#fff') === '#ffffff', normalizeHexColor('#fff'));
  assert(normalizeHexColor('2563EB') === '#2563eb', normalizeHexColor('2563EB'));
  assert(normalizeHexColor('#2563ebff') === '#2563eb', 'an 8-digit hex should keep its colour and drop the alpha');
  assert(normalizeHexColor('  #0F766E  ') === '#0f766e', 'surrounding whitespace should not matter');
});

check('anything that is not a colour is refused outright', () => {
  for (const junk of ['#12345', '#gggggg', 'rebeccapurple', '', null, undefined, 42, '#']) {
    assert(normalizeHexColor(junk) === null, `accepted ${JSON.stringify(junk)}`);
  }
});

check('a colour too pale to carry white content is not usable', () => {
  // The launcher is white-on-brand; these would render as an invisible bubble.
  for (const pale of ['#ffffff', '#fefefe', '#f8fafc', '#ffe066']) {
    assert(!isUsableBrandColor(pale), `${pale} should be rejected`);
  }
  // Dark or muted is a legitimate brand choice and is left alone.
  for (const fine of ['#2563eb', '#111111', '#0f766e', '#7c3aed', '#b91c1c']) {
    assert(isUsableBrandColor(fine), `${fine} should be accepted`);
  }
});

check('a declared theme-color wins, and a dark-scheme variant does not', () => {
  const html = `
    <head>
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b1120">
      <meta name="theme-color" content="#0f766e">
    </head>`;
  assert(brandColorFromHtml(html) === '#0f766e', brandColorFromHtml(html));
});

check("Safari's pinned-tab colour counts as a declaration", () => {
  const html = `<link rel="mask-icon" href="/safari.svg" color="#b91c1c">`;
  assert(brandColorFromHtml(html) === '#b91c1c', brandColorFromHtml(html));
});

check('the CSS variable a theme defines for its own accent is read', () => {
  // What WordPress and Elementor emit, which is most of this market.
  const html = `<style>:root{--e-global-color-primary:#7C3AED;--color-text:#111}</style>`;
  assert(brandColorFromHtml(html) === '#7c3aed', brandColorFromHtml(html));
});

check('a declared colour that is unusable is skipped, not served', () => {
  const html = `<meta name="theme-color" content="#ffffff">`;
  assert(brandColorFromHtml(html) === null, 'white was accepted as a brand colour');
});

check('nothing declared means nothing claimed', () => {
  assert(brandColorFromHtml('<html><body>no colours here</body></html>') === null, 'invented a colour');
  assert(brandColorFromHtml('') === null, 'invented a colour from nothing');
});

check('the fallback picks the page\'s own most-used colour, never its greys', () => {
  const html = `
    <style>
      .a{color:#111111}.b{border:1px solid #e5e7eb}.c{background:#f8fafc}
      .btn{background:#059669}.btn:hover{background:#059669}.link{color:#059669}
      .one-off{color:#ff00ff}
    </style>`;
  assert(mostUsedBrandColorInHtml(html) === '#059669', mostUsedBrandColorInHtml(html));
  // A single decorative occurrence is not evidence of a brand colour.
  assert(mostUsedBrandColorInHtml('<style>.x{color:#ff00ff}</style>') === null, 'a lone colour was treated as the brand');
  // Greys and near-blacks are everywhere on every page; they are never it.
  assert(mostUsedBrandColorInHtml('<style>.a{color:#333333}.b{color:#333333}</style>') === null, 'a grey was treated as a brand colour');
});

console.log(`\nBrand Colour Test Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
