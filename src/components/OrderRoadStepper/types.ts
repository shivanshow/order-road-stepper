import type { CSSProperties, ReactNode } from 'react';
import type { StepIconName } from './icons';

export type { StepIconName };

export interface OrderStep {
  /** Stable identifier, e.g. "shipped". Used to match `current` when it is a string. */
  key: string;
  /** Text shown under the stop. */
  label: string;
  /** Optional secondary line, e.g. a timestamp. */
  description?: string;
  /**
   * Built-in icon name, or a custom 24x24 SVG path (stroke based, like Lucide icons).
   * When omitted the icon is guessed from the key/label.
   */
  icon?: StepIconName | { path: string };
}

export type StepperTheme = 'light' | 'dark';

export interface OrderRoadStepperProps {
  steps: OrderStep[];
  /**
   * The current status: an index into `steps`, a step key, or null / -1 for "not started".
   * Unknown values are ignored (the last valid status is kept) and a warning is logged.
   */
  current: number | string | null | undefined;
  /** Height in px of the 3D road area (labels are rendered below it). Default 220. */
  height?: number;
  theme?: StepperTheme;
  /** Cab / accent colour of the truck. Any CSS colour. */
  truckColor?: string;
  /** Text painted on the side of the cargo box (max ~24 chars). */
  truckLabel?: string;
  /**
   * 'follow' (default): the camera frames about two stops and pans with the truck, map style.
   * 'overview': the whole road is fitted into view.
   */
  view?: 'follow' | 'overview';
  /** Speed multiplier for the truck. Default 1. */
  speed?: number;
  /** Drive in from the start of the road on first render. Default true. */
  animateOnMount?: boolean;
  /** 'auto' follows the OS "reduce motion" setting. Default 'auto'. */
  reducedMotion?: boolean | 'auto';
  /** Skip WebGL entirely and render the lightweight 2D version. */
  forceFallback?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  /** Fired when the truck has come to rest at a status. */
  onArrive?: (index: number, step: OrderStep) => void;
  /** Fired for any internal failure (WebGL init, context loss, render errors). The component recovers on its own. */
  onError?: (error: unknown) => void;
  /** Optional slot rendered in the top-left of the road (e.g. ETA badge). */
  children?: ReactNode;
}

export interface NormalizedStep {
  key: string;
  label: string;
  description?: string;
  iconPath: string;
  source: OrderStep;
}
