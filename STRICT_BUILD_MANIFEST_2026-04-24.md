# PubCast v5.6 Strict Hardening Manifest

- Built: 2026-04-24T20:03:19.877419+00:00
- Base: PubCast_v5_6_boring_checks_hardened_2026-04-24.zip
- This package strips temp folders, __pycache__, pytest cache, README.md.old, and main.py.v5.5.backup from the distributed zip only.
- Validation: pytest => 129 passed, 3 skipped; compileall clean.

## Strict pass additions
- Jinja-backed rendering for control/dressing/bar/gallery/analytics template pages instead of leaking raw template syntax.
- Replaced zero-byte static/bots.js with a defensive control-room bot manager UI.
- Expanded atomic JSON writes to user state, projects autosaves, performance state, pubworld block/preset/prototype/tracker saves, dressing room security state/manifests, credentials, choreography export, and both camera configuration writers.
- Added strict regression tests for rendered pages, bot asset presence, autosave/state tmp-leak guards, credential payload writes, and choreography export.