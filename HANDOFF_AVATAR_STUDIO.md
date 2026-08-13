
# PubCast Avatar Studio Upgrade — Handoff

This bundle replaces the placeholder sphere approach with a real procedural humanoid rig, hooks that rig into the existing ethereal avatar system, adds camera-follow directives that work with the current camera stack, and wires Studio Architect planning into a concrete API.

## What was added

- `modules/avatar_studio_bridge.py`
  - Stores avatar slots / stage positions
  - Broadcasts camera directives
  - Calls the existing `LLMOrchestrator` as Studio Architect
  - Exposes `/api/avatar-studio/*`

- `static/js/avatar/avatar_humanoid_runtime.js`
  - Builds an actual humanoid rig from articulated body segments
  - Uses the existing `EtherealSkinMaterial`
  - Applies live gestures, color, mood, and skeleton frames
  - Supports director camera following

- `static/js/avatar/avatar_camera_studio.js`
  - Tiny client helpers for camera follow and architect plan requests

- `static/avatar_studio_demo.html`
  - One page that proves the loop works: spawn → mood/gesture → camera follow → architect plan

- `main.py`
  - Includes the new avatar studio router at boot

## What this solves

1. The avatar is no longer a sphere. It is now an articulated humanoid rig.
2. The rig can be driven by `enhanced_gesture`, `avatar_mood_change`, and `skeleton_frame` messages already used by the existing ethereal system.
3. Cameras can now be aimed at avatar slots through a clean route instead of manual edits.
4. Studio Architect is no longer abstract; it now has a real endpoint that reads room history and returns production directives.

## What still remains

- This rig is articulated, not skinned. It is a strong production placeholder that reads as a humanoid on stage, but it is not yet a hero GLB.
- If you later obtain real Manny/Sheila GLBs, you can swap the runtime internals while keeping the same bridge API.
- Existing complex stage pages are not rewritten here. This bundle gives you a clean working core and demo without risking those pages.

## First run

1. Start PubCast normally.
2. Open `/static/avatar_studio_demo.html` in the browser.
3. Spawn Manny and Sheila.
4. Use mood / gesture / shot buttons.
5. Ask the Studio Architect for a production note.
