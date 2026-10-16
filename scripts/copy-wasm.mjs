// Copies MediaPipe's WebAssembly runtime out of node_modules into public/wasm,
// so the app serves it from our own origin (no CDN, works offline once cached).
// Runs automatically before `npm run dev` and `npm run build`.
//
// Only the two variants the app can use are copied: the normal (SIMD) build and
// the no-SIMD fallback. FilesetResolver.forVisionTasks() picks between them.
// The "module" variants are only used with useModule=true, which we don't use.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const src = "node_modules/@mediapipe/tasks-vision/wasm";
const dest = "public/wasm";
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
const files = readdirSync(src).filter((f) => !f.includes("_module_"));
for (const f of files) cpSync(`${src}/${f}`, `${dest}/${f}`);
console.log(`copied ${files.join(", ")} -> ${dest}`);
