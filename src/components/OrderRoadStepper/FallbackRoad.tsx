import { useEffect, useRef, useState } from 'react';
import { StepIcon, StepLabels } from './StepLabels';
import type { NormalizedStep } from './types';

const PAD = 8; // % of width kept free at each end

function stopPercent(i: number, n: number) {
  return n <= 1 ? 50 : PAD + ((100 - PAD * 2) * i) / (n - 1);
}

interface FallbackRoadProps {
  steps: NormalizedStep[];
  index: number;
  height: number;
  truckColor: string;
  reducedMotion: boolean;
  ariaLabel: string;
  onArrive: (index: number) => void;
}

/** Pure CSS/SVG version used when WebGL is unavailable or keeps failing. Same API, same semantics. */
export function FallbackRoad({ steps, index, height, truckColor, reducedMotion, ariaLabel, onArrive }: FallbackRoadProps) {
  const n = steps.length;
  const [moving, setMoving] = useState(false);
  const [density, setDensity] = useState('normal');
  const rootRef = useRef<HTMLDivElement>(null);
  const prevIndex = useRef(index);
  const onArriveRef = useRef(onArrive);
  useEffect(() => {
    onArriveRef.current = onArrive;
  });

  useEffect(() => {
    if (prevIndex.current === index) {
      onArriveRef.current(index);
      return;
    }
    prevIndex.current = index;
    if (reducedMotion) {
      onArriveRef.current(index);
      return;
    }
    setMoving(true);
    const id = window.setTimeout(() => {
      setMoving(false);
      onArriveRef.current(index);
    }, 1400);
    return () => window.clearTimeout(id);
  }, [index, reducedMotion]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const gap = n > 1 ? (el.clientWidth * (1 - (PAD * 2) / 100)) / (n - 1) : el.clientWidth;
      setDensity(gap < 70 ? 'tight' : gap < 115 ? 'compact' : 'normal');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  const truckLeft = index < 0 ? 1 : stopPercent(index, n) + 0.8;
  const progress = index < 0 ? 0 : stopPercent(index, n);

  return (
    <div ref={rootRef}>
      <div className={`ors__fb${moving ? ' is-moving' : ''}${reducedMotion ? ' is-reduced' : ''}`} style={{ height }}>
        <div className="ors__fb-road">
          <div className="ors__fb-progress" style={{ width: `${progress}%` }} />
        </div>
        {steps.map((s, i) => (
          <span
            key={s.key}
            className={`ors__fb-stop${i <= index ? ' is-reached' : ''}`}
            style={{ left: `${stopPercent(i, n)}%` }}
          >
            <StepIcon path={s.iconPath} size={14} />
          </span>
        ))}
        <div className="ors__fb-truck" style={{ left: `${truckLeft}%` }}>
          <svg viewBox="0 0 64 32" width="64" height="32" aria-hidden="true">
            <rect x="1" y="4" width="36" height="20" rx="2" fill="#f8fafc" stroke="#cbd5e1" />
            <rect x="1" y="19" width="36" height="3" fill={truckColor} />
            <path d="M38 10h12l8 8v6H38z" fill={truckColor} />
            <path d="M50 12l5 6h-5z" fill="#1e293b" />
            <circle cx="12" cy="26" r="4.5" fill="#111827" />
            <circle cx="48" cy="26" r="4.5" fill="#111827" />
            <circle cx="12" cy="26" r="2" fill="#d1d5db" />
            <circle cx="48" cy="26" r="2" fill="#d1d5db" />
          </svg>
        </div>
      </div>
      <StepLabels
        steps={steps}
        reachedCount={index + 1}
        currentIndex={index}
        ariaLabel={ariaLabel}
        listRef={(el) => {
          if (el) {
            el.dataset.ready = 'true';
            el.dataset.density = density;
          }
        }}
        itemStyle={(i) => ({ left: `${stopPercent(i, n)}%`, transform: 'translateX(-50%)' })}
      />
    </div>
  );
}
