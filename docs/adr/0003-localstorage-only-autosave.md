# 0003. localStorage-only autosave, no backend persistence

## Status

Accepted

## Context

Users expect their diagram source to survive a reload. The options were a backend (accounts, DB, sync across devices) or browser-local persistence only.

## Decision

Source is autosaved to `localStorage` under the key `qack-maid:source` on every `input` event (see [[CONTEXT]] — Autosave). On load, the saved value is restored, falling back to the `flowchart` Example if nothing is saved. No accounts, no server-side storage, no cross-device sync.

## Consequences

- Consistent with ADR-0001 (offline-only): nothing to sync means nothing to send over the network.
- State is per-browser, per-device — clearing site data or switching browsers loses the saved diagram. Users who need persistence across devices must Export and store the file themselves.
- Multi-document support (saved diagram library, named files) is out of scope under this ADR; it would need a storage model beyond one flat `localStorage` key.
