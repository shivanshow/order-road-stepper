import { useSyncExternalStore } from 'react';
import type { OrderStep } from '../components/OrderRoadStepper';

/**
 * Demo "backend": one order shared between the admin and buyer pages.
 * Persisted in localStorage and pushed to other tabs with BroadcastChannel
 * (falling back to the `storage` event). Every read is validated, so a
 * corrupted or foreign value just resets to the default order.
 */

export const ORDER_STEPS: OrderStep[] = [
  { key: 'placed', label: 'Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out', label: 'Out for delivery', icon: 'outForDelivery' },
  { key: 'delivered', label: 'Delivered' },
];

export interface OrderState {
  status: number;
  /** ISO time each step was reached; null for steps not reached yet. */
  timestamps: Array<string | null>;
  updatedAt: number;
}

const STORAGE_KEY = 'quickcart:order:A-10294';
const CHANNEL = 'quickcart-order-sync';
const N = ORDER_STEPS.length;

function defaultState(): OrderState {
  const placed = new Date(Date.now() - 2 * 24 * 3600e3);
  placed.setHours(10, 24, 0, 0);
  return {
    status: 1,
    timestamps: [placed.toISOString(), new Date(placed.getTime() + 38 * 60e3).toISOString(), null, null, null],
    updatedAt: Date.now(),
  };
}

function isValid(v: unknown): v is OrderState {
  if (!v || typeof v !== 'object') return false;
  const s = v as OrderState;
  return (
    Number.isInteger(s.status) &&
    s.status >= 0 &&
    s.status < N &&
    Array.isArray(s.timestamps) &&
    s.timestamps.length === N &&
    s.timestamps.every((t) => t === null || (typeof t === 'string' && !Number.isNaN(Date.parse(t)))) &&
    typeof s.updatedAt === 'number'
  );
}

function load(): OrderState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) return parsed;
    }
  } catch {
    // storage blocked or corrupted: use the default
  }
  return defaultState();
}

let state: OrderState = typeof window === 'undefined' ? defaultState() : load();
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function receive(next: unknown) {
  if (!isValid(next) || next.updatedAt <= state.updatedAt) return;
  state = next;
  emit();
}

if (typeof window !== 'undefined') {
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => receive(e.data);
  } catch {
    channel = null;
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      receive(JSON.parse(e.newValue));
    } catch {
      // ignore malformed values written by something else
    }
  });
}

function commit(next: OrderState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota: still works within this tab and via BroadcastChannel
  }
  try {
    channel?.postMessage(next);
  } catch {
    // channel closed
  }
  emit();
}

export const orderStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setStatus(index: number) {
    const status = Math.min(N - 1, Math.max(0, Math.floor(index)));
    if (status === state.status) return;
    const now = new Date().toISOString();
    const timestamps = state.timestamps.map((t, i) => (i <= status ? t ?? now : null));
    commit({ status, timestamps, updatedAt: Math.max(Date.now(), state.updatedAt + 1) });
  },
  reset() {
    commit({ ...defaultState(), updatedAt: Math.max(Date.now(), state.updatedAt + 1) });
  },
};

export function useOrder() {
  return useSyncExternalStore(orderStore.subscribe, orderStore.get, orderStore.get);
}

export function formatStamp(iso: string | null, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', withTime ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' });
}

/** Rough ETA: placed + 4 days. */
export function estimatedDelivery(s: OrderState) {
  const placed = s.timestamps[0] ? new Date(s.timestamps[0]) : new Date();
  return new Date(placed.getTime() + 4 * 24 * 3600e3);
}
