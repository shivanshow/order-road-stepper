import type { CSSProperties, Ref } from 'react';
import { ICON_PATHS } from './icons';
import type { NormalizedStep } from './types';

export function StepIcon({ path, size = 18, strokeWidth = 2 }: { path: string; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

interface StepLabelsProps {
  steps: NormalizedStep[];
  reachedCount: number;
  currentIndex: number;
  listRef?: Ref<HTMLOListElement>;
  itemRef?: (index: number) => (el: HTMLLIElement | null) => void;
  itemStyle?: (index: number) => CSSProperties | undefined;
  ariaLabel: string;
}

/** The semantic, accessible part of the stepper: an ordered list with aria-current. */
export function StepLabels({ steps, reachedCount, currentIndex, listRef, itemRef, itemStyle, ariaLabel }: StepLabelsProps) {
  return (
    <ol className="ors__labels" ref={listRef} aria-label={ariaLabel}>
      {steps.map((step, i) => {
        const reached = i < reachedCount;
        const current = i === currentIndex && reached;
        return (
          <li
            key={step.key}
            ref={itemRef?.(i)}
            style={itemStyle?.(i)}
            className={`ors__label${reached ? ' is-reached' : ''}${current ? ' is-current' : ''}`}
            aria-current={i === currentIndex ? 'step' : undefined}
          >
            <span className="ors__label-icon">
              <StepIcon path={step.iconPath} size={19} />
              {reached && (
                <span className="ors__label-check">
                  <StepIcon path={ICON_PATHS.check} size={11} strokeWidth={3.5} />
                </span>
              )}
            </span>
            <span className="ors__label-text">{step.label}</span>
            {step.description && <span className="ors__label-desc">{step.description}</span>}
            <span className="ors__sr-only">{reached ? ' (completed)' : ' (pending)'}</span>
          </li>
        );
      })}
    </ol>
  );
}
