// Checks WCAG contrast ratios for Tessera's color tokens, in both themes.
// Reads the tokens straight from src/styles.css so the check can't drift from the CSS.
// Usage: node scripts/check-contrast.mjs   (exits with code 1 if anything fails)
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles.css", "utf8");
function tokens(selector) {
  const start = css.indexOf(selector + " {");
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}
const themes = { light: tokens(":root"), dark: tokens(':root[data-theme="dark"]') };

// WCAG 2 relative luminance and contrast ratio.
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum, what it is]
const TEXT = 4.5, UI = 3;
const checks = [
  ["text", "bg", 7, "body text"], ["text", "surface", 7, "body text on cards"], ["text", "surface-2", 7, "text on inner panels"],
  ["muted", "surface", TEXT, "secondary text"], ["muted", "bg", TEXT, "secondary text on page"], ["muted", "surface-2", TEXT, "secondary text on panels"],
  ["accent-text", "accent", TEXT, "primary button text"], ["highlight-text", "highlight", TEXT, "highlighted key text"],
  ["text", "accent-soft", TEXT, "privacy bar text"], ["text", "ok-soft", TEXT, "text on 'go' / fired"], ["text", "bad-soft", TEXT, "text on error"],
  ["text", "warn-soft", TEXT, "text on paused / ready"], ["text", "hl-row-bg", TEXT, "text in highlighted row"],
  ["bad", "surface", TEXT, "error text"], ["bad", "bad-soft", TEXT, "error text on error background"], ["warn", "warn-soft", TEXT, "'keep holding' text"],
  ["accent-text", "accent", TEXT, "step number / badge"],
  ["border-strong", "surface", UI, "button and key borders"], ["border-strong", "bg", UI, "borders on page"],
  ["focus", "bg", UI, "focus ring on page"], ["focus", "surface", UI, "focus ring on cards"],
  ["fill", "track", UI, "bar fill vs. empty bar"], ["accent", "surface", UI, "primary buttons / active tab vs. card"],
  ["accent", "bg", UI, "primary buttons vs. page"], ["brand", "surface", UI, "brand accents (icons, callout bar)"],
  ["accent-text", "accent", TEXT, "active tab text"], ["muted", "surface-2", TEXT, "secondary text on inner panels"],
  ["ok", "surface", UI, "'ok' borders"], ["bad", "surface", UI, "'problem' borders"], ["warn", "surface", UI, "'paused/ready' borders"],
  ["hl-row-border", "surface", UI, "highlighted row border"], ["highlight-outline", "hl-row-bg", UI, "outline around highlighted key vs. its row"],
  ["highlight", "hl-row-bg", 1.0, "(info) highlighted key vs. its row"],
  // Calm blue: setup hints, "can't see your face", pauses, the message box, calibration card.
  ["calm-text", "calm-soft", 7, "text in calm boxes"], ["text", "calm-soft", 7, "message text"],
  ["calm", "calm-soft", TEXT, "calm text / borders in calm boxes"], ["calm", "surface", TEXT, "calm text on cards"],
  ["calm", "ok-soft", TEXT, "face-lost note on the green 'go' card"], ["calm", "bg", UI, "calm borders on page"],
  // Logo: the eyes and mouth must stand out from the face.
  ["logo-eye", "logo-lit", UI, "logo eyes vs. lit face"], ["logo-mouth", "logo-lips", UI, "logo smile line vs. lips"],
  ["logo-glint", "logo-eye", UI, "eye highlight vs. eye"],
  // Welcome page: cards, hero, the 3D demo frame, and the red "not tested yet" dots.
  ["text", "card-2", 7, "text on cards (darker end)"], ["muted", "card-2", TEXT, "secondary text on cards"],
  ["blue-card-text", "blue-card-1", TEXT, "text on the blue card (lighter end)"], ["blue-card-muted", "blue-card-1", TEXT, "secondary text on the blue card"],
  ["blue-card-text", "blue-card-pill", UI, "highlighted word on the blue card (large text)"], ["pill-text", "pill-bg", TEXT, "highlighted word in card titles"],
  ["text", "hero-glow", 7, "headline on the hero glow"], ["muted", "hero-glow", TEXT, "hero text on the glow"],
  ["text", "frame-2", 7, "demo note under the 3D face"], ["muted", "frame-2", TEXT, "demo legend under the 3D face"],
  ["node-untested", "map-bg", UI, "red dot on the 3D face"], ["node-untested", "surface", UI, "red dot in the legend"],
];

let failed = 0;

// The dark tokens are written twice (picked dark, and Auto on a dark system). They must match.
const autoDark = tokens(':root:not([data-theme="light"])');
for (const [k, v] of Object.entries(themes.dark)) {
  if (autoDark[k] !== v) { console.log(`  FAIL dark token --${k} differs between the two dark blocks (${v} vs ${autoDark[k]})`); failed++; }
}
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name} theme`);
  for (const [fg, bg, min, what] of checks) {
    if (!t[fg] || !t[bg]) { console.log(`  MISSING token ${fg} or ${bg}`); failed++; continue; }
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"} ${r.toFixed(2).padStart(5)}:1 (need ${min}) ${what}: --${fg} on --${bg}`);
  }
}
console.log(failed ? `\n${failed} check(s) failed` : "\nAll contrast checks passed");
process.exit(failed ? 1 : 0);
