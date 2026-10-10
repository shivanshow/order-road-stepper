# OrderRoadStepper

A 3D (three.js) order-status stepper for React: a road with one stop per status and a truck that
drives to the current status and parks in a truck-sized bay painted in front of each status board.
Reached boards flip and turn green.

```tsx
import { OrderRoadStepper } from './components/OrderRoadStepper';

<OrderRoadStepper
  steps={[
    { key: 'placed', label: 'Placed', description: 'Oct 8, 10:24' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'delivered', label: 'Delivered' },
  ]}
  current="confirmed"          // index, key, or null for "not started"
  truckColor="#2563eb"
  truckLabel="QuickCart"
  theme="light"                // 'light' | 'dark'
  onArrive={(i, step) => {}}
  onError={(err) => {}}        // for logging; the component recovers by itself
/>
```

Copy `src/components/OrderRoadStepper/` into any React 18/19 app that has `three` installed.

## Props

| prop | default | notes |
| --- | --- | --- |
| `steps` | required | `{ key, label, description?, icon? }[]`. `icon` is a built-in name (`placed`, `confirmed`, `packed`, `shipped`, `outForDelivery`, `delivered`, `cancelled`, `returned`) or `{ path }` with 24×24 SVG path data. Guessed from key/label if omitted. |
| `current` | required | Index, step key/label, or `null`/`-1`. Unknown values keep the previous status. |
| `view` | `'follow'` | `'follow'`: the camera frames about two stops and pans with the truck (map style). `'overview'`: fits the whole road. |
| `height` | `320` | Height of the 3D area in px (labels sit below it). |
| `theme` | `'light'` | `'dark'` turns on headlights and a night palette. |
| `truckColor` / `truckLabel` | `#2563eb` / none | Invalid colours fall back to the default. |
| `speed` | `1` | Speed multiplier. |
| `animateOnMount` | `true` | Drive in from the start of the road on first render. |
| `reducedMotion` | `'auto'` | Follows the OS "reduce motion" setting; the truck then jumps without animating. |
| `forceFallback` | `false` | Always use the 2D CSS version. |
| `children` | | Overlay slot shown at the top-left of the road (e.g. ETA badge). |

## How it handles failures

- Bad input (non-array steps, duplicate or missing keys, NaN or unknown `current`, invalid colour) is cleaned up, with one console warning per problem.
- No WebGL, or a WebGL error at startup → 2D fallback with the same labels and accessibility.
- WebGL context lost or repeated render errors → the scene is rebuilt (2 retries), then it switches to the 2D fallback.
- React render errors are caught by an error boundary and switch to the 2D fallback.
- Changing the status mid-drive smoothly retargets the truck, including driving backwards.
- Rendering pauses when the component is off-screen or the tab is hidden. All GPU resources are released on unmount (safe under StrictMode).
- Narrow screens: if the whole road would make the truck too small, the camera follows the truck like a map.
- Accessibility: a semantic `<ol>` with `aria-current="step"` and a polite live region that announces arrivals.

## Demo pages

`npm run dev`, then open:

- **Buyer:** `http://localhost:5173/#/`, a full order-details page with the road at the top.
- **Admin:** `http://localhost:5173/#/admin`, status buttons only (no 3D).

When the order reaches Delivered, the buyer page lets the truck finish its trip, then collapses the
road and shows a "Package delivered" banner. A delivered order opened later never shows the road.

Open both in separate tabs. Status changes made on the admin page animate live on the buyer page.
Sync uses `localStorage` + `BroadcastChannel` (`src/demo/orderStore.ts`), standing in for a real
backend. Replace it with your API or websocket and pass the status to `current`.
