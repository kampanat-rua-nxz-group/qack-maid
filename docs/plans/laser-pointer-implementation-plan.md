# Laser pointer implementation plan

Status: Planned; implementation has not started.

Behavior reference: [Persistent laser pointer and drag trail](../specs/laser-pointer.md).

## Scope and current behavior

Update the existing presentation Laser tool in `index.html`. It currently adds trail points on every mouse movement and renders the dot as the newest expiring trail point. Separate the persistent dot from the fading trail, require a left-button drag for trail creation, and add a saved color preference.

Keep the existing canvas overlay, single-file deployment, offline behavior, presentation controls, and export isolation. No new runtime dependencies or ADR are needed.

## 1. Separate dot and trail state

In the laser section near `drawLaserFrame`, `handleLaserPointerMove`, and `setPresentationTool`:

- Track the latest eligible mouse position separately from timestamped trail points. A missing position means the dot is hidden.
- Track whether a stroke is active and which pointer started it. Mouse movement alone must never activate a stroke.
- Remove `laserIdleTimer`, `scheduleLaserIdle`, and the laser-specific idle visibility flag. Preserve the separate presentation toolbar idle timer.
- Render fading trail points first, using the existing 950 ms lifetime, 4 px radius, and 14 px glow. Render the current dot last at full opacity with its existing 7 px radius.
- Keep viewport coordinates and device-pixel-ratio scaling so dot size does not change with diagram zoom.
- Reuse the existing animation loop; do not create additional loops on tool changes.

## 2. Handle mouse gestures and boundaries

Use pointer events consistently for presentation movement and the new laser gesture handlers, while preserving Pointer mode's toolbar behavior. Limit this feature to mouse input; touch and pen behavior are outside this change.

- Define an eligible position as inside the presentation wrapper and outside the actual toolbar rectangle. The toolbar's existing 24 px reveal padding is still eligible for the dot; it is not the toolbar exclusion boundary.
- On eligible mouse movement in Laser mode, update the dot. Append trail points only when an active stroke exists and the left-button bit remains set in `buttons`.
- Start a stroke only on a left-button press inside the eligible area. Seed its starting position, then append movement samples. A stationary click leaves only the persistent dot once the transient sample fades.
- On left-button release, end the stroke while retaining the eligible dot position.
- On toolbar entry, presentation-area exit, window blur, or pointer cancellation, end the stroke and hide the dot. Retain existing trail samples to finish fading while Laser remains active.
- Returning to the eligible area may restore the dot, but must not resume drawing until a fresh left-button press. A press begun on the toolbar or outside the area cannot become a stroke by dragging inward.
- Listen for release at window scope during presentation so a release outside the wrapper cannot leave drawing active. Avoid pointer capture for Laser, since leaving the area deliberately ends drawing.
- Reuse the existing Laser guards that suppress panning and spotlight selection. Do not prevent toolbar input events or change wheel pan/zoom.

## 3. Add and persist laser color

Extend the existing presentation toolbar markup, styles, and element references:

- Add a compact native color input with an accessible label, "Laser color". Keep it available in the presentation toolbar alongside the tool buttons so the color can be chosen before enabling Laser.
- Default to `#dc2626`. Store the preference under a dedicated key such as `qack-maid:laser-color`.
- Read the preference once at startup, validate it as a six-digit hex color, and fall back to red when missing or invalid. Catch storage failures so color selection still works for the current session.
- On color input, update the dot and trail rendering color immediately and persist the value. Derive canvas RGB values from the validated hex value; preserve the existing age-based trail alpha and glow.
- Use the current selected color for all visible samples. Opening the picker ends any stroke through the toolbar boundary rule; selecting a color does not enable Laser or begin drawing.
- Ensure presentation keyboard handling and toolbar idle behavior allow the native picker to be operated without accidentally stepping the diagram or dismissing presentation. Keep the toolbar visible while the color control is being used, then resume its existing idle behavior.

## 4. Complete lifecycle cleanup

Integrate the new state and listeners with `enterPresentation`, `teardownPresentation`, `createLaserCanvas`, `removeLaserCanvas`, and `setPresentationTool`:

- Register presentation gesture listeners once on entry and remove them on teardown.
- Clear dot position, stroke state, and trail samples on tool switches and presentation exit. Clear the canvas promptly when leaving Laser.
- Preserve the saved color across tool switches and presentation sessions. Presentation still starts in Pointer mode.
- On re-entry, begin with no stale pointer position or active stroke. Show the dot once an eligible mouse location is observed.
- Preserve canvas resize handling, fullscreen fallback, and animation-frame cancellation on exit.

## 5. Update behavioral coverage

Update `tests/specs/presentation-laser.spec.ts`. Replace the existing test that expects hover movement to create a trail and the entire canvas to become transparent after 1.2 seconds.

Use canvas pixel checks in small regions around known positions, accounting for device pixel ratio and avoiding the dot's glow when inspecting old trail locations. A whole-canvas alpha sum cannot distinguish a persistent dot from a lingering tail.

Cover these observable behaviors:

1. Hover shows a dot without leaving a trail; the stationary dot survives both the 950 ms trail lifetime and the presentation idle timeout.
2. Left-button dragging draws a trail. Older portions disappear during a sufficiently long drag; after release the trail disappears while the dot remains.
3. Right/middle-button gestures and a left-button press begun outside the eligible area do not create trails.
4. Toolbar entry, area exit, blur, and cancellation end drawing. Returning while the button remains held shows only the dot; a fresh press starts a new stroke.
5. Blank presentation background is eligible, the actual toolbar is excluded, and toolbar reveal padding still permits the dot.
6. Tool switching, exit, and repeated presentation entry leave no stale dot or stroke.
7. The color control defaults to red, changes the rendered dot and trail, persists after reload, and tolerates an invalid stored value.
8. Existing tests continue to cover cursor behavior, spotlight suppression, navigation, toolbar reveal rules, and export isolation. Add focused coverage for any changed color-control keyboard behavior.

Prefer polling rendered output over tight timing assertions. Use generous fade margins and browser events for cancellation/focus cases that cannot be reliably driven by the headless mouse API; verify actual window transitions manually as well.

## 6. Validate and finish

From `tests/`, run the focused suite first:

```sh
npm test -- specs/presentation-laser.spec.ts
```

After it passes, run the existing regression suite once:

```sh
npm test
```

Manually check native fullscreen and its fallback, the native color picker, dragging out of the browser window and back, focus loss, and pointer visibility after zoom/resize. Verify normal cursor behavior on the toolbar and that keyboard color selection does not trigger diagram navigation.

Review the final diff for obsolete idle-hide comments and listener cleanup. Update the behavior specification's status after implementation and validation. Report automated results and any manual checks that could not be completed.

## Completion criteria

The agreed dot, drag, boundary, and saved-color behavior is implemented; focused and regression checks pass; the deployed app still requires only its existing static files; and laser visuals remain absent from exports.
