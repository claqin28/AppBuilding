import { defineConfig, type Plugin } from "vite";

/**
 * Content-Security-Policy added to production builds only (the dev server
 * needs a websocket for live reload). connect-src 'self' means the browser
 * itself blocks any network request to another site, so the privacy promise
 * ("nothing leaves your device") is enforced, not just stated.
 * 'wasm-unsafe-eval' is required to run MediaPipe's WebAssembly.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const cspPlugin = (): Plugin => ({
  name: "csp",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  // Relative base so the build works under a sub-path (e.g. GitHub Pages /repo-name/).
  base: "./",
  plugins: [cspPlugin()],
});
