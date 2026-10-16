// Copies MediaPipe's WebAssembly runtime out of node_modules into public/wasm,
// so the app serves it from our own origin (no CDN, works offline once cached).
// Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, mkdirSync } from "node:fs";

const src = "node_modules/@mediapipe/tasks-vision/wasm";
const dest = "public/wasm";
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`copied ${src} -> ${dest}`);
