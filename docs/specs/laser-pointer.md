# Persistent laser pointer and drag trail

Status: Implemented and validated — focused (`tests/specs/presentation-laser.spec.ts`) and full regression Playwright suites pass. See [the implementation plan](../plans/laser-pointer-implementation-plan.md) for implementation notes and outstanding manual checks.

## Behavior

- Laser remains a presentation-only tool, enabled using the existing Laser control.
- While Laser is enabled, show a dot at the mouse location throughout the presentation area, including blank space surrounding the diagram, excluding the toolbar.
- Keep the dot visible when the mouse is stationary. Hide it outside the eligible area, on window focus loss, when switching tools, and when leaving presentation mode.
- Mouse movement without a held left button moves only the dot.
- A left-button press in the eligible area begins a stroke. Movement during that stroke adds a trail that continuously fades, retaining the existing 950 ms lifetime.
- Stop drawing on button release, entering the toolbar, leaving the presentation area, or losing window focus. After an interruption, require a fresh left-button press to begin another stroke. Existing trail portions finish fading while the presentation remains active in Laser mode.
- Releasing the button leaves the dot visible while the mouse remains in the eligible area. A click without movement produces no lasting annotation.
- Keep the existing dot size, glow, and trail styling. Laser continues to replace the normal cursor over the eligible area; toolbar controls use the normal cursor.
- Preserve wheel pan/zoom and existing Laser suppression of drag-to-pan, hover spotlight, and click selection. Preserve toolbar reveal behavior.

## Color

- Add a laser color picker to the presentation toolbar.
- The chosen color applies to both the dot and trail; default to the existing red (`#dc2626`).
- Remember the choice across visits using local browser storage, consistent with the app's offline behavior.
- Keep size, glow, and fade duration fixed.

## Verification

- A stationary dot remains visible beyond the trail fade and presentation idle timeouts.
- Hover movement creates no trail; left-button dragging does, with continuous fading during and after the drag.
- Non-left buttons do not start a stroke.
- Toolbar entry, area exit, focus loss, and release stop drawing; returning with a button held does not resume an interrupted stroke.
- Tool switching and presentation exit clean up laser visuals.
- A custom color affects the dot and trail and survives a reload; a new preference defaults to red.
- Existing navigation, toolbar behavior, and exports continue working; exports contain no laser visuals.
