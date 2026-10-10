import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { FallbackRoad } from './FallbackRoad';
import { RoadCanvas } from './RoadCanvas';
import type { OrderRoadStepperProps } from './types';
import { clamp, isCssColor, isWebGLAvailable, normalizeSteps, resolveIndex, warnOnce } from './utils';
import './OrderRoadStepper.css';

const MAX_SCENE_RETRIES = 2;

type Mode = 'pending' | '3d' | 'fallback';

function useReducedMotion(pref: boolean | 'auto' | undefined) {
  const [system, setSystem] = useState(false);
  useEffect(() => {
    if (pref !== 'auto' && pref !== undefined) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystem(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [pref]);
  return typeof pref === 'boolean' ? pref : system;
}

export function OrderRoadStepper({
  steps: rawSteps,
  current,
  height: rawHeight = 320,
  theme: rawTheme = 'light',
  truckColor: rawTruckColor = '#2563eb',
  truckLabel,
  speed = 1,
  view = 'follow',
  animateOnMount = true,
  reducedMotion: reducedPref = 'auto',
  forceFallback = false,
  ariaLabel = 'Order progress',
  className,
  style,
  onArrive,
  onError,
  children,
}: OrderRoadStepperProps) {
  const steps = useMemo(() => normalizeSteps(rawSteps), [rawSteps]);
  const theme = rawTheme === 'dark' ? 'dark' : 'light';
  const height = clamp(Number.isFinite(rawHeight) ? rawHeight : 220, 120, 800);
  const truckColor = isCssColor(rawTruckColor) ? rawTruckColor : '#2563eb';
  if (truckColor !== rawTruckColor) warnOnce(`Invalid truckColor "${String(rawTruckColor)}", using default.`);
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const reducedMotion = useReducedMotion(reducedPref);

  // Keep the last status we could understand, so a bad value never throws the truck back to the start.
  const [lastValid, setLastValid] = useState(-1);
  const resolved = resolveIndex(current, steps);
  if (resolved === null) warnOnce(`Unknown status "${String(current)}"; keeping the previous one.`);
  else if (resolved !== lastValid) setLastValid(resolved);
  const index = clamp(resolved ?? lastValid, -1, steps.length - 1);

  const [mode, setMode] = useState<Mode>('pending');
  const [sceneKey, setSceneKey] = useState(0);
  const [reachedCount, setReachedCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const failures = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);

  const callbacks = useRef({ onArrive, onError, steps });
  useEffect(() => {
    callbacks.current = { onArrive, onError, steps };
  });

  useEffect(() => {
    setMode(forceFallback || !isWebGLAvailable() ? 'fallback' : '3d');
  }, [forceFallback]);

  useEffect(() => () => window.clearTimeout(retryTimer.current), []);

  const reportError = useCallback((err: unknown) => {
    try {
      callbacks.current.onError?.(err);
    } catch {
      // consumer callback errors must not break us
    }
  }, []);

  const handleFatal = useCallback(
    (err: unknown) => {
      reportError(err);
      failures.current += 1;
      window.clearTimeout(retryTimer.current);
      if (failures.current > MAX_SCENE_RETRIES) {
        setMode('fallback');
        return;
      }
      // Remount the scene after a short pause (e.g. GPU reset after context loss).
      retryTimer.current = window.setTimeout(() => setSceneKey((k) => k + 1), 400 * failures.current);
    },
    [reportError],
  );

  const handleArrive = useCallback((i: number) => {
    const { onArrive: cb, steps: list } = callbacks.current;
    const step = list[i];
    if (!step) return;
    setAnnouncement(`Order status: ${step.label}`);
    try {
      cb?.(i, step.source);
    } catch (err) {
      reportError(err);
    }
  }, [reportError]);

  const handleBoundaryError = useCallback(
    (err: unknown) => {
      reportError(err);
      setMode('fallback');
    },
    [reportError],
  );

  const fallback = (
    <FallbackRoad
      steps={steps}
      index={index}
      height={height}
      truckColor={truckColor}
      reducedMotion={reducedMotion}
      ariaLabel={ariaLabel}
      onArrive={handleArrive}
    />
  );

  let content;
  if (!steps.length) {
    content = (
      <div className="ors__empty" style={{ height }}>
        No tracking information yet
      </div>
    );
  } else if (mode === 'pending') {
    content = <div className="ors__stage" style={{ height }} />;
  } else if (mode === 'fallback') {
    content = fallback;
  } else {
    content = (
      <ErrorBoundary fallback={fallback} onError={handleBoundaryError}>
        <RoadCanvas
          key={sceneKey}
          steps={steps}
          index={index}
          reachedCount={reachedCount}
          height={height}
          theme={theme}
          truckColor={truckColor}
          truckLabel={truckLabel}
          speed={safeSpeed}
          view={view === 'overview' ? 'overview' : 'follow'}
          reducedMotion={reducedMotion}
          animateOnMount={animateOnMount && sceneKey === 0}
          ariaLabel={ariaLabel}
          onReachedChange={setReachedCount}
          onArrive={handleArrive}
          onFatal={handleFatal}
        />
      </ErrorBoundary>
    );
  }

  return (
    <section
      className={`ors${className ? ` ${className}` : ''}`}
      data-theme={theme}
      data-mode={mode}
      style={style}
      aria-label={ariaLabel}
    >
      {children && <div className="ors__slot">{children}</div>}
      {content}
      <div className="ors__sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </section>
  );
}
