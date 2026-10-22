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
  ["fill", "track", UI, "bar fill vs. empty bar"], ["accent", "surface", UI, "accent marks (tabs, borders)"],
  ["ok", "surface", UI, "'ok' borders"], ["bad", "surface", UI, "'problem' borders"], ["warn", "surface", UI, "'paused/ready' borders"],
  ["hl-row-border", "surface", UI, "highlighted row border"], ["highlight-outline", "hl-row-bg", UI, "outline around highlighted key vs. its row"],
  ["highlight", "hl-row-bg", 1.0, "(info) highlighted key vs. its row"],
];

let failed = 0;
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
