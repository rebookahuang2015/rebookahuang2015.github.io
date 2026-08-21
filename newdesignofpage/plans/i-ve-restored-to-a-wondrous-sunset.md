# Making the Gesture Symphony splash more interactive (classy)

## Context
The splash screen (`src/App.tsx` + `src/index.css`) currently looks refined but feels
static: aside from the cursor-following note trail and looping shimmer/glow, nothing
responds to the user. The user wants it to feel more alive and interactive — they floated
"make Gesture Symphony bounce a little" — while keeping the luxury, Albert-Hall-orchestra
aesthetic. A literal bounce risks feeling cartoonish, so the goal is subtle, physics-feeling
motion that reacts to the user rather than looping on its own.

Chosen direction: **subtle & refined**, with a gentle spring-lift on the title and a soft
tap ripple as the "alive" touches.

## Approach

All work stays in the two existing files. No new dependencies (CSS transitions/transforms
+ a little React state; no motion library needed).

### 1. Cursor parallax on the title — `src/App.tsx`
- Add pointer tracking that computes a normalized offset from screen center
  (reuse the existing `onPointerMove` handler on the root `div` — extend it, don't add a
  second listener).
- Store a small `{ tx, ty }` in state (throttled via the existing `performance.now()` gate
  pattern already in `handlePointerMove`).
- Apply a subtle `translate3d` + slight `rotateX/rotateY` to the title `<h1>` via inline
  `transform`, with a `perspective` on its wrapper. Keep magnitude small (≈ ±8px / ±3deg)
  so it reads as "floating under a spotlight," not tilting.
- Add a CSS `transition: transform 0.4s cubic-bezier(...)` so it eases rather than snaps.

### 2. Gentle idle "breath" (the tasteful alternative to a bounce) — `src/index.css`
- Add a keyframe (`title-float`) that drifts the title a few px vertically over ~6s,
  `ease-in-out infinite`.
- Apply it to a wrapper element so it composes with the parallax transform on the inner
  element (separate elements to avoid transform conflicts — outer = idle float, inner =
  parallax tilt).

### 3. Spring-lift + glow bloom on hover — `src/App.tsx` + `src/index.css`
- Track hover proximity to the title (simple `onMouseEnter/Leave` on the title wrapper, or
  reuse pointer position vs. title bounds).
- On hover: nudge the title up slightly and intensify the existing `title-glow` (add a
  `title-glow--active` modifier that boosts the drop-shadow values already defined in
  `.title-glow` / `glow-breathe`).
- Uses CSS transitions for the spring feel (`cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot
  curve = the subtle "bounce" the user asked for, done classily).

### 4. Soft tap ripple — `src/App.tsx` + `src/index.css`
- On click (extend the existing `onClick={() => setTapped(true)}`), spawn a gold ring
  element at the pointer coordinates, mirroring the existing `trail` state/`setTimeout`
  cleanup pattern (add a `ripples` state array; remove each after its animation).
- Add a `ripple` keyframe in CSS: a thin gold ring scaling up from ~0 to large while fading
  out (~0.9s).

### Reuse notes
- Extend the existing `handlePointerMove` (`src/App.tsx:55`) rather than adding a new
  listener — it already has the throttle gate and pointer coords.
- Mirror the existing `trail` array + `idRef` + `setTimeout` cleanup pattern
  (`src/App.tsx:63-76`) for both ripples and any transient elements.
- Reuse existing glow tokens/keyframes (`.title-glow`, `glow-breathe`,
  `--color-gold*`) rather than introducing new colors.
- Respect `prefers-reduced-motion`: wrap the idle float / parallax in a media query that
  disables the looping/movement for users who opt out.

## Files to modify
- `src/App.tsx` — pointer parallax state, hover proximity, ripple state, title wrapper
  restructure (outer float / inner parallax), transform inline styles.
- `src/index.css` — `title-float` keyframe, `ripple` keyframe, `title-glow--active`
  modifier, transitions, `prefers-reduced-motion` guard.

## Verification
- The Vite dev server is already running on `$PORT`; open the preview.
- Move the cursor around: title should gently tilt/parallax toward it and ease back.
- Leave the cursor still: title should slowly breathe/drift (unless reduced-motion is on).
- Hover over the title: it should lift with a slight springy overshoot and the glow should
  bloom.
- Click anywhere: a soft gold ring should ripple out from the click point and fade.
- Toggle OS "reduce motion" and confirm the looping/parallax motion is calmed.
- Confirm the existing note trail, shimmer, and fade-in intro still work and nothing jitters.
