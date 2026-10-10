import { useCallback, useEffect, useRef } from 'react';
import { RoadScene, type RoadSceneCallbacks } from './RoadScene';
import { StepLabels } from './StepLabels';
import type { NormalizedStep, StepperTheme } from './types';

const LABEL_HALF = 70; // px, half of the label's max width; keeps edge labels inside the box

interface RoadCanvasProps {
  steps: NormalizedStep[];
  index: number;
  reachedCount: number;
  height: number;
  theme: StepperTheme;
  truckColor: string;
  truckLabel?: string;
  speed: number;
  reducedMotion: boolean;
  animateOnMount: boolean;
  view: 'follow' | 'overview';
  ariaLabel: string;
  onReachedChange: (count: number) => void;
  onArrive: (index: number) => void;
  onFatal: (error: unknown) => void;
}

export function RoadCanvas(props: RoadCanvasProps) {
  const { steps, index, reachedCount, height, theme, truckColor, truckLabel, speed, reducedMotion, animateOnMount, ariaLabel, view } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const labelEls = useRef<(HTMLLIElement | null)[]>([]);
  const sceneRef = useRef<RoadScene | null>(null);
  const hasDrivenIn = useRef(false);

  // Latest values for use inside the long-lived scene without rebuilding it.
  const latest = useRef({ props, index, speed, reducedMotion });
  useEffect(() => {
    latest.current = { props, index, speed, reducedMotion };
  });

  const handleLayout = useCallback((xs: Array<number | null>, width: number) => {
    const list = listRef.current;
    let prev: number | null = null;
    let minGap = Infinity;
    xs.forEach((x, i) => {
      const el = labelEls.current[i];
      if (!el) return;
      if (x === null) {
        el.style.visibility = 'hidden';
        return;
      }
      const px = Math.min(Math.max(x, LABEL_HALF), Math.max(LABEL_HALF, width - LABEL_HALF));
      el.style.visibility = '';
      el.style.transform = `translate3d(${px.toFixed(1)}px,0,0) translateX(-50%)`;
      if (prev !== null) minGap = Math.min(minGap, x - prev);
      prev = x;
    });
    if (list) {
      list.dataset.ready = 'true';
      list.dataset.density = minGap < 70 ? 'tight' : minGap < 115 ? 'compact' : 'normal';
    }
  }, []);

  // Anything that changes geometry/materials rebuilds the scene; everything else is applied live.
  const buildKey = [theme, truckColor, truckLabel ?? '', view, ...steps.map((s) => `${s.key}:${s.label}:${s.iconPath}`)].join('|');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const l = latest.current;
    const callbacks: RoadSceneCallbacks = {
      onReachedChange: (c) => latest.current.props.onReachedChange(c),
      onArrive: (i) => latest.current.props.onArrive(i),
      onLayout: handleLayout,
      onFatal: (e) => latest.current.props.onFatal(e),
    };
    let scene: RoadScene;
    try {
      scene = new RoadScene({
        container: host,
        iconPaths: steps.map((s) => s.iconPath),
        labels: steps.map((s) => s.label),
        view,
        initialIndex: l.index,
        driveIn: animateOnMount && !hasDrivenIn.current,
        theme,
        truckColor,
        truckLabel,
        speed: l.speed,
        reducedMotion: l.reducedMotion,
        callbacks,
      });
    } catch (err) {
      l.props.onFatal(err);
      return;
    }
    sceneRef.current = scene;
    return () => {
      // StrictMode unmounts before the first frame; only count a drive-in that was actually shown.
      if (scene.hasRendered) hasDrivenIn.current = true;
      scene.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildKey, handleLayout]);

  useEffect(() => {
    sceneRef.current?.setTarget(index);
  }, [index, buildKey]);

  useEffect(() => {
    sceneRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion, buildKey]);

  useEffect(() => {
    sceneRef.current?.setSpeed(speed);
  }, [speed, buildKey]);

  return (
    <>
      <div ref={hostRef} className="ors__stage" style={{ height }} />
      <StepLabels
        steps={steps}
        reachedCount={reachedCount}
        currentIndex={index}
        ariaLabel={ariaLabel}
        listRef={listRef}
        itemRef={(i) => (el) => {
          labelEls.current[i] = el;
        }}
      />
    </>
  );
}
