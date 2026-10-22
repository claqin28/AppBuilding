# Third-party code and data

Everything here is bundled with or downloaded by the app. Each entry gives the source,
license, and where it's used.

| What | Source | License | Used in |
|---|---|---|---|
| MediaPipe Tasks Vision library (`@mediapipe/tasks-vision` 1.1.1), including the WebAssembly runtime copied to `public/wasm/` | https://github.com/google-ai-edge/mediapipe (via npm) | Apache-2.0 | `src/vision/landmarker.ts` |
| Three.js 0.186.1, including OrbitControls (`three` on npm) | https://threejs.org / https://github.com/mrdoob/three.js | MIT | `src/viz/head3d.ts` (lazy-loaded) |
| Canonical face model: 468 point positions, converted by `scripts/make-canonical-face.mjs` | https://github.com/google-ai-edge/mediapipe, `mediapipe/modules/face_geometry/data/canonical_face_model.obj` | Apache-2.0 | `src/viz/canonicalFace.ts` |
| Face mesh triangles (`FACE_LANDMARKS_TESSELATION`) and connection sets | part of `@mediapipe/tasks-vision` (above) | Apache-2.0 | `src/viz/faceRegions.ts` |
| Inter font, variable (`@fontsource-variable/inter` 5.3.0): body text | https://github.com/rsms/inter, packaged by https://fontsource.org | SIL Open Font License 1.1 (license text shipped at `licenses/Inter-OFL.txt`) | `src/main.ts`, `src/styles.css`; bundled and served from the app's own site, no font CDN |
| Inter Tight font, variable (`@fontsource-variable/inter-tight` 5.3.0): headings | https://github.com/rsms/inter-tight, packaged by https://fontsource.org | SIL Open Font License 1.1 (license text shipped at `licenses/Inter-Tight-OFL.txt`) | same as above |
| Face Landmarker model (`face_landmarker.task`, float16 v1; sha256 `64184e22…bc9ff`) | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task | Apache-2.0 (MediaPipe models) | `public/models/` |

The logo (`src/ui/faceLogo.ts`, `src/viz/logoMesh.ts`) is drawn from the canonical
face points and connection sets above; no outside artwork is used.

Build and test tools (not shipped to users): Vite, TypeScript, Vitest. Their licenses
are in `node_modules/*/LICENSE`.

## Planned

- **Word-frequency list for word prediction (M8): not chosen yet.** It must allow
  redistribution with at most attribution (MIT/BSD/Apache/CC0/CC BY), verified from
  the source's own LICENSE file. When it's chosen, it will be recorded here with its
  source URL, license text location, version or date, and any changes made (for example
  filtering offensive words). See `DECISIONS.md`.
