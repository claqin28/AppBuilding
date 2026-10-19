# Third-party code and data

Everything here is bundled with or downloaded by the app. Each entry gives the source,
license, and where it's used.

| What | Source | License | Used in |
|---|---|---|---|
| MediaPipe Tasks Vision library (`@mediapipe/tasks-vision` 1.1.1), including the WebAssembly runtime copied to `public/wasm/` | https://github.com/google-ai-edge/mediapipe (via npm) | Apache-2.0 | `src/vision/landmarker.ts` |
| Face Landmarker model (`face_landmarker.task`, float16 v1; sha256 `64184e22…bc9ff`) | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task | Apache-2.0 (MediaPipe models) | `public/models/` |

Build and test tools (not shipped to users): Vite, TypeScript, Vitest. Their licenses
are in `node_modules/*/LICENSE`.

## Planned

- **Three.js** (including OrbitControls) for the 3D head (V2a): MIT license, version
  0.186.1 at the time of checking. To be added to the table when built.
- **MediaPipe face mesh triangles** (V2a/V2b): taken from `FACE_LANDMARKS_TESSELATION`
  in `@mediapipe/tasks-vision` (Apache-2.0, already listed above). No extra file
  needed. If MediaPipe's `canonical_face_model.obj` (Apache-2.0,
  github.com/google-ai-edge/mediapipe, `mediapipe/modules/face_geometry/data/`) is
  used for the generic export face, it will be listed here.
- **Word-frequency list for word prediction (M8): not chosen yet.** It must allow
  redistribution with at most attribution (MIT/BSD/Apache/CC0/CC BY), verified from
  the source's own LICENSE file. When it's chosen, it will be recorded here with its
  source URL, license text location, version or date, and any changes made (for example
  filtering offensive words). See `DECISIONS.md`.
