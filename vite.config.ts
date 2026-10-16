import { defineConfig, type Plugin } from "vite";

/**
 * Content-Security-Policy, applied in BOTH the dev server and production builds.
 *
 * connect-src 'self' means the browser itself blocks any network request to
 * another site, so "nothing leaves your device" is enforced, not just promised.
 *
 * This matters in practice: @mediapipe/tasks-vision 1.1.1 contains a usage
 * logger that tries to POST statistics to https://odml.pa.googleapis.com/v1/log
 * every 60 seconds, and it has no public off switch. This policy blocks it.
 * (See DECISIONS.md.)
 *
 * 'wasm-unsafe-eval' is required to run MediaPipe's WebAssembly.
 * The dev server additionally allows a websocket to localhost for live reload.
 */
function csp(dev: boolean): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src 'self'${dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

const cspPlugin = (): Plugin => {
  let dev = false;
  return {
    name: "csp",
    configResolved(config) {
      dev = config.command === "serve";
    },
    transformIndexHtml: (html) =>
      html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp(dev)}" />`),
  };
};

export default defineConfig({
  // Relative base so the build works under a sub-path (e.g. GitHub Pages /repo-name/).
  base: "./",
  plugins: [cspPlugin()],
});
