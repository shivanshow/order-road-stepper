import * as THREE from 'three';

export function createSoftDotTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

interface Particle {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  s0: number;
  s1: number;
  a0: number;
}

/** Fixed-size ring buffer of sprites (dust, exhaust). No allocation after construction. */
export class ParticlePool {
  readonly group = new THREE.Group();
  private items: Particle[] = [];
  private cursor = 0;

  constructor(count: number, texture: THREE.Texture | null, color: THREE.ColorRepresentation) {
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.group.add(sprite);
      this.items.push({ sprite, material, vel: new THREE.Vector3(), life: 0, maxLife: 1, s0: 0, s1: 0, a0: 0 });
    }
  }

  spawn(pos: THREE.Vector3, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, alpha: number) {
    if (!this.items.length) return;
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    p.sprite.position.copy(pos);
    p.sprite.visible = true;
    p.sprite.scale.setScalar(s0);
    p.vel.set(vx, vy, vz);
    p.life = 0;
    p.maxLife = life;
    p.s0 = s0;
    p.s1 = s1;
    p.a0 = alpha;
    p.material.opacity = 0;
  }

  update(dt: number) {
    const drag = Math.max(0, 1 - 1.8 * dt);
    for (const p of this.items) {
      if (!p.sprite.visible) continue;
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(drag);
      p.sprite.scale.setScalar(p.s0 + (p.s1 - p.s0) * t);
      p.material.opacity = p.a0 * (1 - t) * Math.min(1, t * 8);
    }
  }
}

interface Line {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  speed: number;
  len: number;
}

/** Wind streaks that rush past the truck while it moves. Lives in truck-local space. */
export class SpeedLines {
  readonly group = new THREE.Group();
  private lines: Line[] = [];
  private front: number;
  private rear: number;

  constructor(count: number, front: number, rear: number) {
    this.front = front + 1.5;
    this.rear = rear - 2.5;
    const geo = new THREE.PlaneGeometry(1, 0.028);
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, material);
      const line = { mesh, material, speed: 0, len: 1 };
      this.respawn(line, 1, true);
      this.group.add(mesh);
      this.lines.push(line);
    }
    this.group.visible = false;
  }

  private respawn(l: Line, dir: number, anywhere = false) {
    const span = this.front - this.rear;
    const above = Math.random() < 0.3;
    l.mesh.position.set(
      anywhere ? this.rear + Math.random() * span : dir >= 0 ? this.front : this.rear,
      above ? 1.95 + Math.random() * 0.35 : 0.35 + Math.random() * 1.55,
      above ? -0.4 + Math.random() * 0.8 : 0.8 + Math.random() * 0.35,
    );
    l.speed = 9 + Math.random() * 7;
    l.len = 0.5 + Math.random() * 1.2;
  }

  update(dt: number, intensity: number, dir: number) {
    this.group.visible = intensity > 0.02;
    if (!this.group.visible) return;
    const span = this.front - this.rear;
    for (const l of this.lines) {
      const p = l.mesh.position;
      p.x -= l.speed * dt * dir * (0.35 + intensity);
      if (p.x < this.rear || p.x > this.front) this.respawn(l, dir);
      const u = (p.x - this.rear) / span;
      const edge = Math.min(1, u * 4, (1 - u) * 4);
      l.mesh.scale.x = l.len * (0.4 + intensity);
      l.material.opacity = intensity * 0.6 * Math.max(0, edge);
    }
  }
}
