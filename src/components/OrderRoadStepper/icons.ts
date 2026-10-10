import * as THREE from 'three';

/** Stroke-only 24x24 path data so the same icon can be drawn in SVG and on a canvas texture. */
export const ICON_PATHS = {
  placed:
    'M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1z M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2 M9 12h6 M9 16h4',
  confirmed: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0z M8 12.5l2.8 2.8L16.5 9.5',
  packed: 'M21 8l-9-5-9 5 9 5 9-5z M3 8v8l9 5 9-5V8 M12 13v8 M7.5 5.5l9 5',
  shipped:
    'M2 6h12v10H2z M14 9h4.5L22 12.5V16h-8z M4.5 18.5a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0-3.5 0z M15.5 18.5a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0-3.5 0z',
  outForDelivery:
    'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z M9.75 9.5a2.25 2.25 0 1 0 4.5 0a2.25 2.25 0 1 0-4.5 0z',
  delivered: 'M3 11l9-7 9 7 M5 9.5V20h14V9.5 M9 15l2 2 4-4',
  cancelled: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0z M9 9l6 6 M15 9l-6 6',
  returned: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  dot: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0z',
} as const;

export type StepIconName = keyof typeof ICON_PATHS;

const GUESSES: Array<[RegExp, StepIconName]> = [
  [/cancel|fail|reject/i, 'cancelled'],
  [/return|refund/i, 'returned'],
  [/out.?for.?deliver|arriv|nearby/i, 'outForDelivery'],
  [/deliver|complete|received/i, 'delivered'],
  [/ship|dispatch|transit/i, 'shipped'],
  [/pack|process|prepar/i, 'packed'],
  [/confirm|accept|approv|paid/i, 'confirmed'],
  [/place|order|creat|new/i, 'placed'],
];

export function isIconName(v: unknown): v is StepIconName {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ICON_PATHS, v);
}

export function resolveIconPath(icon: unknown, key: string, label: string): string {
  if (isIconName(icon)) return ICON_PATHS[icon];
  if (icon && typeof icon === 'object' && typeof (icon as { path?: unknown }).path === 'string') {
    const path = (icon as { path: string }).path.trim();
    // Path data only: letters, numbers, separators. Rejects anything that is not SVG path syntax.
    if (path && /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/.test(path)) return path;
  }
  const hay = `${key} ${label}`;
  for (const [re, name] of GUESSES) if (re.test(hay)) return ICON_PATHS[name];
  return ICON_PATHS.dot;
}

/** White icon on a transparent background, for the sign faces. Returns null if canvas/Path2D is unavailable. */
export function createIconTexture(path: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
  try {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const box = 150;
    ctx.translate((size - box) / 2, (size - box) / 2);
    ctx.scale(box / 24, box / 24);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(path));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  } catch {
    return null;
  }
}

/** Face of a status board: icon in a ring on the left, status name on the right, white on transparent. */
export function createBoardTexture(path: string, label: string, aspect: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
  try {
    const w = 1024;
    const h = Math.max(64, Math.round(w / Math.max(1, aspect)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const r = h * 0.34;
    const cx = h * 0.62;
    const cy = h / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    const box = r * 1.15;
    ctx.translate(cx - box / 2, cy - box / 2);
    ctx.scale(box / 24, box / 24);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(path));
    ctx.restore();

    const text = label.trim().slice(0, 28);
    const left = cx + r + h * 0.22;
    const maxW = w - left - h * 0.3;
    let size = Math.round(h * 0.36);
    const font = (px: number) => `700 ${px}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.font = font(size);
    while (ctx.measureText(text).width > maxW && size > 18) ctx.font = font((size -= 2));
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left, cy + size * 0.04);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  } catch {
    return null;
  }
}
