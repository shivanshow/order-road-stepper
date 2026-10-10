import { resolveIconPath } from './icons';
import type { NormalizedStep, OrderStep } from './types';

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

/** Small deterministic PRNG so scenery is identical between renders. */
export function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const warned = new Set<string>();
export function warnOnce(message: string) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[OrderRoadStepper] ${message}`);
}

let webglSupport: boolean | undefined;
export function isWebGLAvailable(): boolean {
  if (webglSupport !== undefined) return webglSupport;
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    webglSupport = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

export function isCssColor(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') return CSS.supports('color', value);
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

/** Accepts anything and returns a clean, de-duplicated step list. Never throws. */
export function normalizeSteps(steps: unknown): NormalizedStep[] {
  if (!Array.isArray(steps)) {
    if (steps != null) warnOnce('`steps` should be an array.');
    return [];
  }
  const seen = new Set<string>();
  const out: NormalizedStep[] = [];
  steps.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      warnOnce(`steps[${i}] is not an object and was skipped.`);
      return;
    }
    const s = raw as Partial<OrderStep>;
    let key = typeof s.key === 'string' && s.key.trim() ? s.key.trim() : typeof s.key === 'number' ? String(s.key) : '';
    const label = typeof s.label === 'string' && s.label.trim() ? s.label.trim() : key || `Step ${out.length + 1}`;
    if (!key) key = label.toLowerCase().replace(/\s+/g, '-') || `step-${i}`;
    if (seen.has(key)) {
      warnOnce(`Duplicate step key "${key}"; it was renamed.`);
      let n = 2;
      while (seen.has(`${key}-${n}`)) n++;
      key = `${key}-${n}`;
    }
    seen.add(key);
    out.push({
      key,
      label,
      description: typeof s.description === 'string' && s.description.trim() ? s.description : undefined,
      iconPath: resolveIconPath(s.icon, key, label),
      source: raw as OrderStep,
    });
  });
  return out;
}

/**
 * Resolves `current` to an index in [-1, steps.length - 1].
 * Returns null when the value can't be understood, so the caller can keep the previous status.
 */
export function resolveIndex(current: unknown, steps: NormalizedStep[]): number | null {
  if (current === null || current === undefined) return -1;
  if (typeof current === 'number') {
    if (!Number.isFinite(current)) return null;
    return clamp(Math.floor(current), -1, steps.length - 1);
  }
  if (typeof current === 'string') {
    const needle = current.trim().toLowerCase();
    const byKey = steps.findIndex((s) => s.key.toLowerCase() === needle);
    if (byKey >= 0) return byKey;
    const byLabel = steps.findIndex((s) => s.label.toLowerCase() === needle);
    if (byLabel >= 0) return byLabel;
    if (/^-?\d+$/.test(needle)) return clamp(parseInt(needle, 10), -1, steps.length - 1);
  }
  return null;
}
