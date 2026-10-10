import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface Truck {
  /** Moves along the road (x). Faces +x. */
  root: THREE.Group;
  /** Suspension group: bobs and pitches independently of the wheels. */
  body: THREE.Group;
  wheels: THREE.Object3D[];
  wheelRadius: number;
  /** Local x extents of the whole model. */
  frontX: number;
  rearX: number;
  length: number;
  /** Local points where dust / exhaust are emitted. */
  dustPoints: THREE.Vector3[];
  exhaustPoint: THREE.Vector3;
  brakeMaterial: THREE.MeshStandardMaterial;
}

interface TruckOptions {
  color: string;
  label?: string;
  night: boolean;
}

function labelTexture(text: string, color: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const value = text.trim().slice(0, 24).toUpperCase();
    let size = 150;
    const font = (s: number) => `800 ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.font = font(size);
    while (ctx.measureText(value).width > 940 && size > 40) ctx.font = font((size -= 6));
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, 512, 136);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  } catch {
    return null;
  }
}

export function buildTruck({ color, label, night }: TruckOptions): Truck {
  const root = new THREE.Group();
  root.name = 'truck';
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
  const cargo = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.1, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.3, metalness: 0.6 });
  const tire = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.95 });
  const head = new THREE.MeshStandardMaterial({
    color: '#fff8db',
    emissive: '#ffe7a0',
    emissiveIntensity: night ? 3 : 0.5,
  });
  const brake = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ff2a2a', emissiveIntensity: 0.4 });

  const add = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z = 0,
    rotZ = 0,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rotZ;
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Chassis + cargo box
  add(body, new THREE.BoxGeometry(3.3, 0.16, 0.95), dark, 0.08, 0.44);
  add(body, new RoundedBoxGeometry(2.15, 1.3, 1.3, 3, 0.06), cargo, -0.62, 1.17);
  add(body, new THREE.BoxGeometry(2.17, 0.1, 1.32), paint, -0.62, 0.66);
  add(body, new THREE.BoxGeometry(0.02, 1.15, 0.02), dark, -1.705, 1.17);

  // Cab
  add(body, new RoundedBoxGeometry(1.05, 1.0, 1.24, 4, 0.12), paint, 1.05, 1.0);
  add(body, new RoundedBoxGeometry(0.44, 0.5, 1.2, 3, 0.08), paint, 1.72, 0.74);
  add(body, new THREE.BoxGeometry(0.05, 0.42, 1.06), glass, 1.555, 1.18, 0, 0.2);
  add(body, new THREE.BoxGeometry(0.48, 0.34, 1.26), glass, 1.1, 1.2);
  // Roof air deflector between cab and box
  add(body, new THREE.BoxGeometry(0.78, 0.06, 1.1), paint, 0.86, 1.64, 0, -0.41);

  // Front details
  add(body, new RoundedBoxGeometry(0.14, 0.18, 1.28, 2, 0.05), chrome, 1.96, 0.52);
  add(body, new THREE.BoxGeometry(0.03, 0.24, 0.6), dark, 1.945, 0.76);
  for (const z of [-0.43, 0.43]) {
    add(body, new THREE.BoxGeometry(0.04, 0.11, 0.22), head, 1.95, 0.83, z);
    add(body, new THREE.BoxGeometry(0.03, 0.14, 0.12), brake, -1.71, 0.66, z * 1.2);
    add(body, new THREE.BoxGeometry(0.06, 0.2, 0.05), dark, 1.45, 1.22, z * 1.65);
  }

  // Exhaust pipe
  const pipe = add(body, new THREE.CylinderGeometry(0.04, 0.04, 0.3, 10), chrome, -1.62, 0.36, 0.35, Math.PI / 2);
  pipe.castShadow = false;

  // Brand label on the near (+z) side
  if (label && label.trim()) {
    const tex = labelTexture(label, color);
    if (tex) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 0.475),
        new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5 }),
      );
      plane.position.set(-0.62, 1.24, 0.652);
      body.add(plane);
    }
  }

  // Wheels: axis along z so rotation.z spins them
  const wheelRadius = 0.3;
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.26, 28).rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.27, 20).rotateX(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.26, 0.045, 0.28);
  const wheels: THREE.Object3D[] = [];
  for (const x of [1.42, -0.5, -1.12]) {
    for (const z of [-0.56, 0.56]) {
      const w = new THREE.Group();
      w.position.set(x, wheelRadius, z);
      add(w, tireGeo, tire, 0, 0);
      const rim = add(w, rimGeo, chrome, 0, 0);
      rim.castShadow = false;
      add(w, spokeGeo, dark, 0, 0).castShadow = false;
      add(w, spokeGeo, dark, 0, 0, 0, Math.PI / 2).castShadow = false;
      root.add(w);
      wheels.push(w);
    }
  }

  // Headlight beam on the road at night
  if (night && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, 'rgba(255,236,170,0.9)');
      g.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 22);
      ctx.lineTo(128, 0);
      ctx.lineTo(128, 64);
      ctx.lineTo(0, 42);
      ctx.fill();
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 1.8).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(canvas),
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      beam.position.set(3.6, 0.02, 0);
      root.add(beam);
    }
  }

  const box = new THREE.Box3().setFromObject(root);
  return {
    root,
    body,
    wheels,
    wheelRadius,
    frontX: box.max.x,
    rearX: box.min.x,
    length: box.max.x - box.min.x,
    dustPoints: [new THREE.Vector3(-1.3, 0.06, 0.6), new THREE.Vector3(-1.3, 0.06, -0.6)],
    exhaustPoint: new THREE.Vector3(-1.8, 0.36, 0.35),
    brakeMaterial: brake,
  };
}
