/**
 * The 3D head: a wireframe + point cloud of the 468 face points, drawn with
 * Three.js. This file is only downloaded when someone turns the 3D view on
 * (dynamic import), and it's served from this site like everything else.
 *
 * It only DISPLAYS shapes and colors. Deciding the colors happens in
 * src/signal/movementMap.ts, which has no Three.js in it and is unit tested.
 *
 * Performance and comfort:
 *  - Renders ON DEMAND: only when the shape, colors, view, or size change.
 *    There is no constant animation loop, and the caller throttles live updates.
 *  - No auto-rotation and no "inertia" after dragging (respects reduced motion,
 *    and nothing moves unless the person or their face moves).
 *  - dispose() releases all GPU memory when the view closes.
 *
 * The head is shown like a mirror (the person's left on the screen's left),
 * matching the mirrored camera preview.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const BACKGROUND = "#0b0d11";

export interface ScreenPoint {
  x: number;
  y: number;
  /** False if the point is behind the camera. */
  visible: boolean;
}

export class Head3D {
  /** Called after every render (used to move the text labels). */
  onRender: (() => void) | null = null;

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 1, 200);
  private controls: OrbitControls;
  private group = new Group();
  private geometry = new BufferGeometry();
  private lineMaterial = new LineBasicMaterial({ vertexColors: true });
  private pointMaterial = new PointsMaterial({ vertexColors: true, size: 3, sizeAttenuation: false });
  private positions: BufferAttribute;
  private colors: BufferAttribute;
  private observer: ResizeObserver;
  private frameRequested = false;
  private width = 1;
  private height = 1;

  constructor(
    private host: HTMLElement,
    edges: readonly [number, number][],
    pointCount: number,
  ) {
    // preserveDrawingBuffer lets "Export image" read the picture back.
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(BACKGROUND);
    const canvas = this.renderer.domElement;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "3D face map. The same numbers are in the table below.");
    host.append(canvas);

    this.positions = new BufferAttribute(new Float32Array(pointCount * 3), 3);
    this.colors = new BufferAttribute(new Float32Array(pointCount * 3), 3);
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("color", this.colors);
    this.geometry.setIndex(edges.flat());

    this.group.add(new LineSegments(this.geometry, this.lineMaterial), new Points(this.geometry, this.pointMaterial));
    this.group.scale.x = -1; // mirror view
    this.scene.add(this.group);

    this.camera.position.set(0, 0, 40);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false; // no drifting after the drag ends
    this.controls.enablePan = false;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 90;
    this.controls.saveState();
    this.controls.addEventListener("change", () => this.requestRender());

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  /** New point positions: 468 × (x, y, z). */
  setShape(points: Float32Array): void {
    (this.positions.array as Float32Array).set(points.subarray(0, this.positions.array.length));
    this.positions.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.requestRender();
  }

  /** One "#rrggbb" color per point. */
  setColors(hex: readonly string[]): void {
    const c = new Color();
    const arr = this.colors.array as Float32Array;
    for (let i = 0; i < hex.length && i * 3 < arr.length; i++) {
      c.set(hex[i]);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    this.colors.needsUpdate = true;
    this.requestRender();
  }

  /** Saves where the camera is, so it can be put back after an export. */
  saveView(): { position: Vector3; target: Vector3 } {
    return { position: this.camera.position.clone(), target: this.controls.target.clone() };
  }

  restoreView(v: { position: Vector3; target: Vector3 }): void {
    this.camera.position.copy(v.position);
    this.controls.target.copy(v.target);
    this.controls.update();
    this.requestRender();
  }

  resetView(): void {
    this.controls.reset();
    this.requestRender();
  }

  /** Where a 3D point lands on the canvas, in CSS pixels (for HTML labels). */
  project(p: readonly [number, number, number]): ScreenPoint {
    const v = new Vector3(-p[0], p[1], p[2]); // same mirror as the group
    v.project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, visible: v.z < 1 };
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Renders right now and returns the canvas (for exporting an image). */
  snapshot(): HTMLCanvasElement {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.renderer.render(this.scene, this.camera);
      this.onRender?.();
    });
  }

  dispose(): void {
    this.onRender = null;
    this.observer.disconnect();
    this.controls.dispose();
    this.geometry.dispose();
    this.lineMaterial.dispose();
    this.pointMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }
}
