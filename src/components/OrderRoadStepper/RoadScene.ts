import * as THREE from 'three';
import { buildTruck, type Truck } from './truck';
import { ParticlePool, SpeedLines, createSoftDotTexture } from './effects';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createBoardTexture } from './icons';
import { clamp, damp, mulberry32 } from './utils';
import type { StepperTheme } from './types';

export interface RoadSceneCallbacks {
  /** Number of stops (from the first) the truck has reached. */
  onReachedChange: (count: number) => void;
  /** Truck came to rest at `index` (-1 = start of road). */
  onArrive: (index: number) => void;
  /** Screen x (px) of every stop, or null if off-screen. Fired when the camera moves or resizes. */
  onLayout: (xs: Array<number | null>, width: number) => void;
  /** Unrecoverable for this instance (context lost, repeated render errors). */
  onFatal: (error: unknown) => void;
}

export interface RoadSceneOptions {
  container: HTMLElement;
  iconPaths: string[];
  labels: string[];
  view: 'follow' | 'overview';
  initialIndex: number;
  driveIn: boolean;
  theme: StepperTheme;
  truckColor: string;
  truckLabel?: string;
  speed: number;
  reducedMotion: boolean;
  callbacks: RoadSceneCallbacks;
}

const PALETTES = {
  light: {
    fog: '#dcecf7',
    ground: '#8fc46f',
    shoulder: '#d8ceb4',
    asphalt: '#454c58',
    line: '#f8fafc',
    hemiSky: '#ffffff',
    hemiGround: '#7a9a63',
    hemi: 1.9,
    sun: '#fff3dc',
    sunI: 2.4,
    pending: '#94a3b8',
    reached: '#16a34a',
    glow: 0.25,
    post: '#e5e7eb',
    route: '#22c55e',
    routeRest: '#cbd5e1',
    trees: ['#3f9b4f', '#58b260', '#2f8a4a', '#6fbf5a'],
    trunk: '#7c5a3a',
    hills: '#79b55e',
  },
  dark: {
    fog: '#121c33',
    ground: '#1f3626',
    shoulder: '#3b3a36',
    asphalt: '#262b33',
    line: '#cbd5e1',
    hemiSky: '#9fb3ff',
    hemiGround: '#0b1a10',
    hemi: 0.9,
    sun: '#c3d0ff',
    sunI: 1.1,
    pending: '#64748b',
    reached: '#22c55e',
    glow: 0.8,
    post: '#94a3b8',
    route: '#22c55e',
    routeRest: '#475569',
    trees: ['#1d4d2b', '#26603a', '#183f24', '#2c6b3c'],
    trunk: '#4a3726',
    hills: '#1a3022',
  },
} as const;

const ROAD_W = 4.4;
const LANE_Z = 1.05;
const MARKER_Z = -(ROAD_W / 2 + 0.9);
const STOP_GAP = 12;
const BAY_W = 1.8; // parking bay painted after each stop, sized to the truck
const BAY_MARGIN = 0.3;
const ACCEL = 4.5;
const BRAKE = ACCEL * 1.5;
const BASE_SPEED = 5.5;
const MAX_HFOV = 46; // degrees; narrower = less perspective lean on wide banners
const MAX_VFOV = 30;
const PITCH = THREE.MathUtils.degToRad(30);
const BOARD_Y = 3.2; // centre height of the status board
const BOARD_H = 1.3;
// Point the camera frames (centre of the image): between the lane and the boards.
const LOOK_Y = 1.6;
const LOOK_Z = -1.2;
const MIN_TRUCK_PX = 90;

interface Marker {
  x: number;
  sign: THREE.Group;
  disc: THREE.MeshStandardMaterial;
  bayLine: THREE.MeshBasicMaterial;
  bayFill: THREE.MeshBasicMaterial;
  halo: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  mix: number;
  reached: boolean;
  pop: number;
}

export class RoadScene {
  private opts: RoadSceneOptions;
  private cb: RoadSceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(MAX_VFOV, 1, 0.5, 2000);
  private palette: (typeof PALETTES)[StepperTheme];
  private truck!: Truck;
  private sun!: THREE.DirectionalLight;
  private markers: Marker[] = [];
  private dust: ParticlePool | null = null;
  private exhaust: ParticlePool | null = null;
  private speedLines: SpeedLines | null = null;
  private traveled!: THREE.Mesh;
  private pendingColor = new THREE.Color();
  private reachedColor = new THREE.Color();
  private lineColor = new THREE.Color();
  private tmp = new THREE.Vector3();

  private stepCount: number;
  private startX = 0;
  private endX = 0;
  private routeStartX = 0;

  // Motion state
  private x = 0;
  private v = 0;
  private accel = 0;
  private targetIndex = -1;
  private targetX = 0;
  private arrivedFired = false;
  private reachedCount = -1;
  private wheelAngle = 0;
  private time = 0;
  private dustAcc = 0;
  private exhaustAcc = 0;

  // View state
  private width = 0;
  private distance = 20;
  private follow = false;
  private visHalf = 10;
  private camX = 0;
  private camReady = false;
  private layoutDirty = true;
  private lastLayoutCamX = NaN;

  // Loop state
  private raf = 0;
  private lastTime = 0;
  private visible = true;
  private inView = true;
  private disposed = false;
  private errorCount = 0;
  private frames = 0;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;

  constructor(opts: RoadSceneOptions) {
    this.opts = opts;
    this.cb = opts.callbacks;
    this.palette = PALETTES[opts.theme] ?? PALETTES.light;
    this.stepCount = Math.max(1, opts.iconPaths.length);

    // Throws when WebGL is unavailable; the React layer turns that into the 2D fallback.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
    try {
      const r = this.renderer;
      r.setClearColor(0x000000, 0);
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      const canvas = r.domElement;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
      opts.container.appendChild(canvas);

      this.build();
      this.placeTruckInitially();
      this.observe();
      this.resize();
      this.start();
    } catch (err) {
      this.dispose();
      throw err;
    }
  }

  /** True once at least one frame has been drawn. */
  get hasRendered() {
    return this.frames > 0;
  }

  // ---------------------------------------------------------------- public API

  setTarget(index: number) {
    if (this.disposed) return;
    const i = clamp(Number.isFinite(index) ? Math.floor(index) : -1, -1, this.stepCount - 1);
    if (i === this.targetIndex) return;
    this.targetIndex = i;
    this.targetX = this.parkX(i);
    this.arrivedFired = false;
    if (this.opts.reducedMotion) {
      this.x = this.targetX;
      this.v = 0;
    }
    this.start();
  }

  setReducedMotion(value: boolean) {
    this.opts.reducedMotion = value;
    if (value) {
      this.x = this.targetX;
      this.v = 0;
    }
    this.start();
  }

  setSpeed(value: number) {
    this.opts.speed = value;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.handleVisibility);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);

    const textures = new Set<THREE.Texture>();
    const disposeMaterial = (m: THREE.Material) => {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      m.dispose();
    };
    this.scene.traverse((obj) => {
      const o = obj as THREE.Mesh;
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(disposeMaterial);
      if (obj instanceof THREE.InstancedMesh) obj.dispose();
    });
    textures.forEach((t) => t.dispose());
    this.scene.clear();
    this.renderer.dispose();
    // Free the GPU context right away: browsers cap live contexts (~16) and StrictMode mounts twice.
    if (!this.renderer.getContext().isContextLost()) this.renderer.forceContextLoss();
    canvas.remove();
  }

  // ---------------------------------------------------------------- layout helpers

  private stopX(i: number) {
    return i * STOP_GAP;
  }

  /** Truck root x when parked at stop i (i = -1: start of road). */
  private parkX(i: number) {
    if (i < 0) return this.routeStartX;
    // Centre the truck in the bay that sits right in front of the board.
    return this.stopX(i) - (this.truck.frontX + this.truck.rearX) / 2;
  }

  private placeTruckInitially() {
    const index = clamp(this.opts.initialIndex, -1, this.stepCount - 1);
    this.targetIndex = index;
    this.targetX = this.parkX(index);
    const driveIn = this.opts.driveIn && !this.opts.reducedMotion && index >= 0;
    this.x = driveIn ? this.parkX(-1) : this.targetX;
    this.truck.root.position.x = this.x;
  }

  // ---------------------------------------------------------------- scene construction

  private build() {
    const p = this.palette;
    const n = this.stepCount;
    this.pendingColor.set(p.pending);
    this.reachedColor.set(p.reached);
    this.lineColor.set(p.line);

    this.truck = buildTruck({ color: this.opts.truckColor, label: this.opts.truckLabel, night: this.opts.theme === 'dark' });
    this.truck.root.position.z = LANE_Z;
    this.scene.add(this.truck.root);

    const endPad = this.truck.length + 2.2;
    this.startX = -endPad;
    this.endX = this.stopX(n - 1) + endPad;
    this.routeStartX = this.startX + 0.6 - this.truck.rearX;
    const roadLen = this.endX - this.startX;
    const midX = (this.startX + this.endX) / 2;

    this.scene.fog = new THREE.Fog(p.fog, 20, 80);

    // Lights
    this.scene.add(new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemi));
    const sun = new THREE.DirectionalLight(p.sun, p.sunI);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -4;
    sun.shadow.camera.right = 4;
    sun.shadow.camera.top = 4;
    sun.shadow.camera.bottom = -4;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 30;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    // Ground, shoulder, asphalt
    const flat = (w: number, d: number) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(flat(roadLen + 400, 260), new THREE.MeshStandardMaterial({ color: p.ground, roughness: 1 }));
    ground.position.set(midX, -0.02, -60);
    ground.receiveShadow = true;
    const shoulder = new THREE.Mesh(flat(roadLen + 400, ROAD_W + 0.8), new THREE.MeshStandardMaterial({ color: p.shoulder, roughness: 1 }));
    shoulder.position.set(midX, -0.01, 0);
    shoulder.receiveShadow = true;
    const road = new THREE.Mesh(flat(roadLen + 400, ROAD_W), new THREE.MeshStandardMaterial({ color: p.asphalt, roughness: 0.92 }));
    road.position.set(midX, 0, 0);
    road.receiveShadow = true;
    this.scene.add(ground, shoulder, road);

    // Edge lines + centre dashes
    const lineMat = new THREE.MeshStandardMaterial({ color: p.line, roughness: 0.6 });
    for (const z of [-(ROAD_W / 2 - 0.15), ROAD_W / 2 - 0.15]) {
      const edge = new THREE.Mesh(flat(roadLen + 400, 0.07), lineMat);
      edge.position.set(midX, 0.004, z);
      edge.receiveShadow = true;
      this.scene.add(edge);
    }
    const dashFrom = this.startX - 60;
    const dashCount = Math.ceil((roadLen + 120) / 1.8);
    const dashes = new THREE.InstancedMesh(flat(0.9, 0.08), lineMat, dashCount);
    const m = new THREE.Matrix4();
    for (let i = 0; i < dashCount; i++) dashes.setMatrixAt(i, m.makeTranslation(dashFrom + i * 1.8, 0.004, 0));
    dashes.receiveShadow = true;
    this.scene.add(dashes);

    // Route ribbon (maps style): faint dashed path to the last stop, solid green behind the truck
    const routeLen = this.parkX(n - 1) - this.routeStartX;
    const restTex = this.dashTexture();
    if (restTex) {
      restTex.wrapS = THREE.RepeatWrapping;
      restTex.repeat.set(Math.max(1, routeLen / 0.9), 1);
    }
    const rest = new THREE.Mesh(
      flat(1, 0.26).translate(0.5, 0, 0),
      new THREE.MeshBasicMaterial({ color: p.routeRest, map: restTex, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    rest.position.set(this.routeStartX, 0.007, LANE_Z);
    rest.scale.x = routeLen;
    this.traveled = new THREE.Mesh(
      flat(1, 0.3).translate(0.5, 0, 0),
      new THREE.MeshBasicMaterial({ color: p.route, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.traveled.position.set(this.routeStartX, 0.009, LANE_Z);
    this.traveled.scale.x = 0.001;
    this.scene.add(rest, this.traveled);

    this.buildMarkers();
    this.buildScenery();

    // Effects
    // Built even with reduced motion so the setting can be toggled at runtime.
    const dot = createSoftDotTexture();
    this.dust = new ParticlePool(60, dot, this.opts.theme === 'dark' ? '#6b6150' : '#cdbb94');
    this.exhaust = new ParticlePool(24, dot, this.opts.theme === 'dark' ? '#4b5563' : '#9ca3af');
    this.scene.add(this.dust.group, this.exhaust.group);
    this.speedLines = new SpeedLines(16, this.truck.frontX, this.truck.rearX);
    this.truck.root.add(this.speedLines.group);
  }

  private dashTexture(): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 8;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(4, 0, 34, 8, 4);
    else ctx.rect(4, 0, 34, 8);
    ctx.fill();
    return new THREE.CanvasTexture(c);
  }

  private buildMarkers() {
    const p = this.palette;
    const postMat = new THREE.MeshStandardMaterial({ color: p.post, roughness: 0.5, metalness: 0.2 });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
    const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false });
    // The board is exactly as wide as the parking bay in front of it.
    const bayLen = this.truck.length + BAY_MARGIN * 2;
    const boardW = bayLen;
    const postH = BOARD_Y - BOARD_H / 2 + 0.15;
    const baseGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.14, 16);
    const postGeo = new THREE.CylinderGeometry(0.07, 0.07, postH, 12);
    const boardGeo = new RoundedBoxGeometry(boardW, BOARD_H, 0.14, 4, 0.14);
    const frameGeo = new RoundedBoxGeometry(boardW + 0.14, BOARD_H + 0.14, 0.1, 4, 0.2);
    const faceGeo = new THREE.PlaneGeometry(boardW, BOARD_H);
    const haloGeo = new RoundedBoxGeometry(boardW + 0.3, BOARD_H + 0.3, 0.02, 4, 0.25);
    const blobGeo = new THREE.CircleGeometry(0.4, 20).rotateX(-Math.PI / 2);
    const bayFillGeo = new THREE.PlaneGeometry(bayLen, BAY_W).rotateX(-Math.PI / 2);

    this.opts.iconPaths.forEach((path, i) => {
      const x = this.stopX(i);
      const g = new THREE.Group();
      g.position.set(x, 0, MARKER_Z);
      for (const px of [-boardW * 0.33, boardW * 0.33]) {
        const base = new THREE.Mesh(baseGeo, postMat);
        base.position.set(px, 0.07, 0);
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(px, postH / 2, 0);
        post.castShadow = true;
        const blob = new THREE.Mesh(blobGeo, shadowMat);
        blob.position.set(px, 0.003, 0);
        g.add(base, post, blob);
      }

      const sign = new THREE.Group();
      sign.position.y = BOARD_Y;
      const disc = new THREE.MeshStandardMaterial({ color: p.pending, emissive: p.reached, emissiveIntensity: 0, roughness: 0.45 });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.z = -0.04;
      sign.add(frame, new THREE.Mesh(boardGeo, disc));
      const tex = createBoardTexture(path, this.opts.labels[i] ?? '', boardW / BOARD_H);
      if (tex) {
        const face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
        face.position.z = 0.075;
        sign.add(face);
      }
      const haloMat = new THREE.MeshBasicMaterial({ color: p.reached, transparent: true, opacity: 0, depthWrite: false });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.z = -0.12;
      halo.visible = false;
      sign.add(halo);
      g.add(sign);
      this.scene.add(g);

      // Parking bay: a truck-sized box painted on the lane directly in front of the board.
      const bayLine = new THREE.MeshBasicMaterial({ color: p.line, transparent: true, opacity: 0.9, depthWrite: false });
      const bayFill = new THREE.MeshBasicMaterial({ color: p.reached, transparent: true, opacity: 0, depthWrite: false });
      const bay = new THREE.Group();
      bay.position.set(x, 0.011, LANE_Z);
      const fill = new THREE.Mesh(bayFillGeo, bayFill);
      fill.position.y = -0.002;
      bay.add(fill);
      const t = 0.1;
      for (const [w, d, ox, oz] of [
        [bayLen, t, 0, BAY_W / 2],
        [bayLen, t, 0, -BAY_W / 2],
        [t, BAY_W, bayLen / 2, 0],
        [t, BAY_W, -bayLen / 2, 0],
      ]) {
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), bayLine);
        edge.position.set(ox, 0, oz);
        bay.add(edge);
      }
      this.scene.add(bay);

      this.markers.push({ x, sign, disc, bayLine, bayFill, halo, haloMat, mix: 0, reached: false, pop: 1 });
    });
  }

  private buildScenery() {
    const p = this.palette;
    const rand = mulberry32(1337);
    const cones: THREE.Matrix4[] = [];
    const rounds: THREE.Matrix4[] = [];
    const trunks: THREE.Matrix4[] = [];
    const coneColors: THREE.Color[] = [];
    const roundColors: THREE.Color[] = [];
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const nearestStop = (x: number) => this.markers.reduce((d, mk) => Math.min(d, Math.abs(mk.x - x)), Infinity);

    for (let x = this.startX - 40; x < this.endX + 40; x += 1.4 + rand() * 2.2) {
      let z = -(ROAD_W / 2 + 3 + rand() * 10);
      if (nearestStop(x) < this.truck.length / 2 + 1.5 && z > -8) z -= 4;
      const s = 0.7 + rand() * 0.8;
      const color = new THREE.Color(p.trees[Math.floor(rand() * p.trees.length)]);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      trunks.push(new THREE.Matrix4().compose(pos.set(x, 0.25 * s, z), q, scl.set(s, s, s)));
      if (rand() < 0.5) {
        cones.push(new THREE.Matrix4().compose(pos.set(x, (0.5 + 0.85) * s, z), q, scl.set(s, s, s)));
        coneColors.push(color);
      } else {
        rounds.push(new THREE.Matrix4().compose(pos.set(x, 1.05 * s, z), q, scl.set(s, s * 0.95, s)));
        roundColors.push(color);
      }
    }
    // Low bushes on the near side
    for (let x = this.startX - 40; x < this.endX + 40; x += 2.5 + rand() * 4) {
      const s = 0.35 + rand() * 0.25;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      rounds.push(new THREE.Matrix4().compose(pos.set(x, 0.15, ROAD_W / 2 + 1.1 + rand() * 1.6), q, scl.set(s, s * 0.7, s)));
      roundColors.push(new THREE.Color(p.trees[Math.floor(rand() * p.trees.length)]));
    }

    const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colors?: THREE.Color[]) => {
      if (!mats.length) return;
      const im = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((mx, i) => {
        im.setMatrixAt(i, mx);
        if (colors) im.setColorAt(i, colors[i]);
      });
      im.castShadow = false;
      this.scene.add(im);
    };
    const leaf = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    instanced(new THREE.ConeGeometry(0.75, 1.7, 7), leaf, cones, coneColors);
    instanced(new THREE.IcosahedronGeometry(0.75, 0), leaf, rounds, roundColors);
    instanced(new THREE.CylinderGeometry(0.09, 0.13, 0.5, 6), new THREE.MeshStandardMaterial({ color: p.trunk, roughness: 1 }), trunks);

    // Distant hills for depth; fog fades them out
    const hillMat = new THREE.MeshStandardMaterial({ color: p.hills, roughness: 1, flatShading: true });
    const hillGeo = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let x = this.startX - 60; x < this.endX + 60; x += 14 + rand() * 12) {
      const hill = new THREE.Mesh(hillGeo, hillMat);
      hill.position.set(x, -0.05, -30 - rand() * 18);
      hill.scale.set(9 + rand() * 9, 2.5 + rand() * 3.5, 6 + rand() * 4);
      this.scene.add(hill);
    }
  }

  // ---------------------------------------------------------------- observers / loop

  private observe() {
    const el = this.opts.container;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(el);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.inView = entries.some((e) => e.isIntersecting);
        this.start();
      });
      this.intersectionObserver.observe(el);
    }
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.visible = document.visibilityState !== 'hidden';
  }

  private handleVisibility = () => {
    this.visible = document.visibilityState !== 'hidden';
    this.start();
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!this.disposed) this.cb.onFatal(new Error('WebGL context lost'));
  };

  private resize() {
    if (this.disposed) return;
    const w = this.opts.container.clientWidth;
    const h = this.opts.container.clientHeight;
    if (w < 2 || h < 2) return;
    this.width = w;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const deg = THREE.MathUtils.radToDeg;
    const rad = THREE.MathUtils.degToRad;
    this.camera.aspect = aspect;
    this.camera.fov = clamp(deg(2 * Math.atan(Math.tan(rad(MAX_HFOV / 2)) / aspect)), 6, MAX_VFOV);
    this.camera.updateProjectionMatrix();
    // Shift lens: the camera looks level (so posts stay vertical) and the image is shifted down
    // to frame the road as if the camera were pitched by PITCH.
    const proj = this.camera.projectionMatrix;
    proj.elements[9] = -Math.tan(PITCH) / Math.tan(rad(this.camera.fov / 2));
    this.camera.projectionMatrixInverse.copy(proj).invert();

    // Fit the whole road if the truck stays readable; otherwise follow the truck like a map.
    const tanV = Math.tan(rad(this.camera.fov / 2));
    const tanH = tanV * this.camera.aspect;
    const fullW = this.endX - this.startX - 2;
    const maxVisW = (this.truck.length * w) / MIN_TRUCK_PX;
    // 'follow' frames about two stops and pans with the truck; 'overview' fits the whole road.
    const wanted = this.opts.view === 'overview' ? fullW : STOP_GAP * 2.5;
    const needW = Math.min(fullW, Math.max(this.truck.length * 2.5, Math.min(wanted, maxVisW)));
    this.distance = Math.max(needW / 2 / tanH, 3.9 / tanV);
    this.visHalf = this.distance * tanH;
    this.follow = this.visHalf * 2 < fullW - 0.01;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.distance * 1.4;
    fog.far = this.distance * 4.5;
    this.camReady = false;
    this.layoutDirty = true;
    this.start();
  }

  private start() {
    if (this.disposed || this.raf) return;
    if (!this.visible || !this.inView) return;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed || !this.visible || !this.inView) return;
    const dt = clamp((now - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = now;
    try {
      if (this.width > 0) {
        const busy = this.update(dt);
        this.renderer.render(this.scene, this.camera);
        this.frames++;
        this.errorCount = 0;
        // With reduced motion we only draw while something is changing.
        if (this.opts.reducedMotion && !busy) return;
      }
    } catch (err) {
      if (++this.errorCount > 3) {
        this.cb.onFatal(err);
        return;
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  // ---------------------------------------------------------------- per-frame update

  /** Returns true while anything is still animating. */
  private update(dt: number): boolean {
    this.time += dt;
    const reduced = this.opts.reducedMotion;
    const t = this.time;
    const truck = this.truck;
    const prevX = this.x;
    const prevV = this.v;

    // --- motion profile: accelerate, cruise, brake; retargets smoothly mid-trip
    const vmax = BASE_SPEED * clamp(this.opts.speed || 1, 0.2, 5);
    const dist = this.targetX - this.x;
    if (reduced) {
      this.x = this.targetX;
      this.v = 0;
    } else if (dist !== 0 || this.v !== 0) {
      const dir = Math.sign(dist);
      const desired = dir * Math.min(vmax, Math.sqrt(2 * ACCEL * Math.abs(dist)));
      const dv = desired - this.v;
      const speedingUp = Math.sign(dv) === Math.sign(this.v) || this.v === 0;
      const maxDv = (speedingUp ? ACCEL : BRAKE) * dt;
      this.v += clamp(dv, -maxDv, maxDv);
      const stepX = this.v * dt;
      if (Math.sign(stepX) === dir && Math.abs(stepX) >= Math.abs(dist)) {
        this.x = this.targetX;
        this.v = 0;
      } else {
        this.x += stepX;
      }
      if (Math.abs(this.targetX - this.x) < 0.002 && Math.abs(this.v) < 0.08) {
        this.x = this.targetX;
        this.v = 0;
      }
    }
    const moving = this.v !== 0;
    if (dt > 0) this.accel = damp(this.accel, (this.v - prevV) / dt, 10, dt);
    if (!moving && Math.abs(this.accel) < 1e-3) this.accel = 0;

    if (!this.arrivedFired && this.x === this.targetX && this.v === 0) {
      this.arrivedFired = true;
      this.cb.onArrive(this.targetIndex);
    }

    // --- truck
    truck.root.position.x = this.x;
    this.wheelAngle -= (this.x - prevX) / truck.wheelRadius;
    for (const w of truck.wheels) w.rotation.z = this.wheelAngle;
    const sf = clamp(Math.abs(this.v) / vmax, 0, 1);
    if (!reduced) {
      const bob = moving
        ? Math.sin(t * 21) * 0.014 * sf + Math.sin(t * 7.3) * 0.01 * sf
        : Math.sin(t * 46) * 0.0035;
      truck.body.position.y = bob;
      // Squat when accelerating, nose-dive when braking
      truck.body.rotation.z = damp(truck.body.rotation.z, clamp(this.accel * 0.007, -0.045, 0.045), 8, dt);
    } else {
      truck.body.position.y = 0;
      truck.body.rotation.z = 0;
    }
    const braking = moving && Math.sign(this.accel) !== Math.sign(this.v) && Math.abs(this.accel) > 0.5;
    truck.brakeMaterial.emissiveIntensity = damp(truck.brakeMaterial.emissiveIntensity, braking ? 2.5 : 0.4, 12, dt);

    // --- effects (world space particles stay behind as the truck drives on)
    if (!reduced) {
      this.speedLines?.update(dt, sf, Math.sign(this.v) || 1);
      if (this.dust && sf > 0.05) {
        this.dustAcc += dt * 45 * sf;
        while (this.dustAcc >= 1) {
          this.dustAcc -= 1;
          const pt = truck.dustPoints[Math.floor(Math.random() * truck.dustPoints.length)];
          this.tmp.copy(pt).add(truck.root.position);
          this.tmp.z += (Math.random() - 0.5) * 0.2;
          this.dust.spawn(this.tmp, -Math.sign(this.v) * (0.4 + Math.random()), 0.3 + Math.random() * 0.6, (Math.random() - 0.3) * 0.6, 0.7 + Math.random() * 0.5, 0.2, 0.8 + Math.random() * 0.4, 0.5);
        }
      }
      if (this.exhaust) {
        this.exhaustAcc += dt * (2.2 + 8 * sf);
        while (this.exhaustAcc >= 1) {
          this.exhaustAcc -= 1;
          this.tmp.copy(truck.exhaustPoint).add(truck.root.position);
          this.exhaust.spawn(this.tmp, -0.5 - 1.5 * sf * Math.sign(this.v || 1), 0.45 + Math.random() * 0.3, 0.1 + Math.random() * 0.2, 1.3, 0.12, 0.55, 0.35);
        }
      }
    } else {
      this.speedLines?.update(dt, 0, 1);
    }
    this.dust?.update(dt);
    this.exhaust?.update(dt);

    // --- which stops has the truck reached?
    const centre = this.x + (truck.frontX + truck.rearX) / 2;
    let count = 0;
    while (count < this.markers.length && count <= this.targetIndex && centre >= this.markers[count].x - 0.4) count++;
    if (count !== this.reachedCount) {
      this.reachedCount = count;
      this.markers.forEach((mk, i) => {
        const r = i < count;
        if (r && !mk.reached) mk.pop = reduced ? 1 : 0;
        mk.reached = r;
      });
      this.cb.onReachedChange(count);
    }

    let animating = moving;
    const currentStop = !moving || Math.abs(this.v) < 0.5 ? count - 1 : -1;
    this.markers.forEach((mk, i) => {
      const goal = mk.reached ? 1 : 0;
      mk.mix = reduced ? goal : damp(mk.mix, goal, 7, dt);
      if (Math.abs(mk.mix - goal) < 0.002) mk.mix = goal;
      else animating = true;
      mk.disc.color.copy(this.pendingColor).lerp(this.reachedColor, mk.mix);
      mk.disc.emissiveIntensity = mk.mix * this.palette.glow;
      mk.bayLine.color.copy(this.lineColor).lerp(this.reachedColor, mk.mix);
      const fillGoal = mk.mix * (i === currentStop ? 0.32 : 0.12);
      mk.bayFill.opacity = reduced ? fillGoal : damp(mk.bayFill.opacity, fillGoal, 6, dt);
      if (mk.pop < 1) {
        mk.pop = Math.min(1, mk.pop + dt / 0.7);
        const e = 1 - Math.pow(1 - mk.pop, 3);
        mk.sign.rotation.x = e * Math.PI * 2; // flip-board style turn
        mk.sign.scale.setScalar(1 + Math.sin(mk.pop * Math.PI) * 0.12);
        animating = true;
      } else {
        mk.sign.rotation.x = 0;
        mk.sign.scale.setScalar(1);
      }
      const showHalo = i === currentStop && !reduced;
      mk.halo.visible = showHalo;
      if (showHalo) {
        const phase = (t * 0.8) % 1;
        mk.halo.scale.set(1 + phase * 0.12, 1 + phase * 0.45, 1);
        mk.haloMat.opacity = (1 - phase) * 0.6;
      }
    });

    // --- route ribbon behind the truck
    this.traveled.scale.x = Math.max(0.001, this.x - this.routeStartX);

    // --- shadow light follows the truck
    this.sun.position.set(this.x + 3, 9, LANE_Z + 6);
    this.sun.target.position.set(this.x, 0, LANE_Z);

    // --- camera
    const fitCx = (this.startX + this.endX) / 2;
    const minCx = this.startX + 1 + this.visHalf;
    const maxCx = this.endX - 1 - this.visHalf;
    const goalCx = this.follow ? clamp(this.x + this.visHalf * 0.2 * (Math.sign(this.v) || 1), minCx, maxCx) : fitCx;
    if (!this.camReady || reduced) {
      this.camX = goalCx;
      this.camReady = true;
    } else {
      this.camX = damp(this.camX, goalCx, 2.5, dt);
    }
    if (Math.abs(this.camX - goalCx) > 0.01) animating = true;
    const d = this.distance;
    const camY = LOOK_Y + Math.sin(PITCH) * d;
    this.camera.position.set(this.camX, camY, LOOK_Z + Math.cos(PITCH) * d);
    this.camera.lookAt(this.camX, camY, LOOK_Z);
    this.camera.updateMatrixWorld();

    if (this.layoutDirty || Math.abs(this.camX - this.lastLayoutCamX) > 0.002) {
      this.layoutDirty = false;
      this.lastLayoutCamX = this.camX;
      this.emitLayout();
    }

    return animating || !this.arrivedFired;
  }

  private emitLayout() {
    const xs = this.markers.map((mk) => {
      this.tmp.set(mk.x, 0, ROAD_W / 2).project(this.camera);
      const px = ((this.tmp.x + 1) / 2) * this.width;
      return px < -1 || px > this.width + 1 ? null : px;
    });
    this.cb.onLayout(xs, this.width);
  }
}
