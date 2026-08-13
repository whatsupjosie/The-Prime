# Pubcast 2i — Cartridge Architecture Audit
## v26 vs Single-Authority Model

**Date:** August 13, 2026

---

## A. VERIFIED FACTS

### The indexer, continuity watchdog, and generation engine currently run INSIDE 2i.

**FACT:** `runIndexer()` in v26 calls the LLM directly from the browser, parses the response, and merges results into a local `intelligence` object. This object is saved into the .2i file. 2i is currently the intelligence authority.

**FACT:** `runContinuityCheck()` calls the LLM directly from the browser, parses findings, merges flags, and manages the flag lifecycle (active/deferred/dismissed/resolved) entirely within 2i.

**FACT:** `generateMore()` calls the LLM directly with a simple last-8-lines prompt. It does NOT use the intelligence data the indexer is collecting. It does NOT go through PubPartner.

**FACT:** Accept/reject buttons in collab mode operate locally. Accept pushes to buffer. Reject nulls the reading. Neither sends a signal to PubPartner.

**FACT:** 2i sends NOTHING to PubPartner except chat messages via `/api/pubpartner/turns/live`. There are no manuscript commit endpoints, no voice training endpoints, no generation-via-PubPartner endpoints.

**FACT:** The .2i file's `intelligence` field is currently treated as authoritative data, not as a derived cache. It is read, written, and acted upon by 2i as the primary intelligence store.

**FACT:** There is zero sync/reconciliation code. The word "sync" does not appear in v26's JavaScript outside of `async`. The previous skeleton described a Phase 5 sync protocol, but it was never built. Nothing needs to be removed.

**FACT:** The PubPartner adapter correctly implements the `/api/pubpartner/turns/live` API shape with `message`, `history`, `user_id`, `session_id`, `project_id`, and `room_id`. It parses `friend_response` and surfaces `provider_fallback`. This is verified against the actual server source.

**FACT:** The indexer and continuity code is well-engineered: type-safe LLM output parsing, alias-aware character matching, fuzzy flag dedup with number-aware word similarity, background AbortController isolation, failure resilience with consecutive-failure warnings. This code should be PRESERVED as the basis for PubPartner's server-side indexer.

---

## B. ARCHITECTURAL CONFLICTS

### Conflict 1: Intelligence authority lives in 2i, not PubPartner

The new architecture says PubPartner owns intelligence. Currently 2i owns it. The indexer, continuity watchdog, merge logic, prompt templates, and flag lifecycle all run client-side in the browser.

**Severity:** Structural. This is the central architectural mismatch.

**Nature:** NOT a bug. The code works correctly. It is simply in the wrong product according to the new authority model. Until PubPartner's manuscript endpoints exist, this code is the ONLY working intelligence implementation.

### Conflict 2: Generation bypasses PubPartner

`generateMore()` calls the LLM directly with a bare context prompt. The new architecture says generation should flow through PubPartner, which would enrich the prompt with cartridge knowledge, style profile, and voice examples.

**Severity:** Medium. Generation works but isn't intelligent.

### Conflict 3: Accept/reject events are local-only

The collab mode's accept/reject/edit flow doesn't notify PubPartner. Voice learning cannot happen because PubPartner never sees the signals.

**Severity:** Medium. The UI exists; the data pipeline doesn't.

### No other conflicts found.

---

## C. OBSOLETE CODE

### Nothing is obsolete.

There is no sync protocol. There is no reconciliation logic. There is no bidirectional intelligence synchronization. There are no offline queues. There is no authority override mechanism.

The previous skeleton DESCRIBED these things. They were never BUILT. There is nothing to remove.

The intelligence code in 2i (indexer, continuity, merge) is not obsolete — it is misplaced. It should eventually migrate to PubPartner's server. Until then, it works correctly as 2i's local intelligence and should remain functional as the offline fallback.

---

## D. REQUIRED CHANGES (in dependency order)

### Phase 1: Define the contracts

Before moving any code, define the API contracts between 2i and PubPartner.

**1a. Manuscript Commit Event**

```
POST /api/pubpartner/manuscript/commit
{
  "protocol_version": 1,
  "user_id": "persistent-client-id",
  "project_id": "manuscript-name",
  "revision_id": "unique-per-commit",
  "timestamp": "ISO-8601",
  "changed_chapters": [7],
  "chapter_hashes": { "7": "abc123" },
  "content": {
    "7": "full chapter text"
  },
  "metadata": {
    "total_chapters": 12,
    "total_words": 24000
  }
}
```

2i sends this on every `approveBuffer()` and `saveDocument()`.

PubPartner decides what to do with it (index, continuity check, update cartridge).

2i does not need to know what PubPartner does.

**1b. Generation Request**

```
POST /api/pubpartner/manuscript/generate
{
  "user_id": "persistent-client-id",
  "project_id": "manuscript-name",
  "current_chapter": 7,
  "context_lines": ["last 8 committed lines"],
  "buffer_lines": ["current draft buffer"],
  "instruction": "continue"
}
```

PubPartner enriches with cartridge knowledge, style profile, voice examples, constructs the full prompt, calls the LLM, returns the result.

Response:

```
{
  "lines": ["generated line 1", "generated line 2"],
  "intelligence_update": {
    "continuity_flags": [...],
    "characters_mentioned": [...]
  }
}
```

**1c. Voice Training Event**

```
POST /api/pubpartner/manuscript/voice-signal
{
  "user_id": "persistent-client-id",
  "project_id": "manuscript-name",
  "type": "accepted" | "rejected" | "rewritten",
  "ai_text": "the generated line",
  "human_text": "the rewritten version (if rewrite)",
  "timestamp": "ISO-8601"
}
```

**1d. Intelligence Retrieval (for offline cache refresh)**

```
GET /api/pubpartner/manuscript/{project_id}/intelligence
```

Returns the current cartridge intelligence for display in 2i. 2i stores this as a read-only cache in the .2i file.

### Phase 2: Build PubPartner endpoints

Move the indexer, continuity watchdog, and merge logic from 2i's JavaScript into PubPartner's Python backend. The algorithms are sound — they need translation, not redesign.

New PubPartner modules:

| Module | Source | Work |
|---|---|---|
| `manuscript_routes.py` | New file | 4 endpoints above |
| `manuscript_indexer.py` | Port from v26 `runIndexer` + `mergeChapterIndex` | Python translation |
| `manuscript_continuity.py` | Port from v26 `runContinuityCheck` + fuzzy dedup | Python translation |
| `manuscript_voice.py` | New | Accept/reject storage + style profiling |

The prompt templates (`INDEXER_SYSTEM_PROMPT`, `CONTINUITY_SYSTEM_PROMPT`) transfer as-is. The merge logic (`mergeChapterIndex`, `mergeContinuityFlags`, `wordSimilarity`) transfers as-is.

Store results in the cartridge via PubPartner's existing vessel/persistence layer.

### Phase 3: Rewire 2i

Once PubPartner endpoints exist and are tested:

**3a.** Add commit event dispatch to `approveBuffer()` and `saveDocument()`. Keep local indexer as fallback when PubPartner is offline.

**3b.** Add generation-via-PubPartner path. When PubPartner is connected, `generateMore()` calls the PubPartner endpoint instead of the LLM directly. When offline, falls back to current direct-LLM behavior.

**3c.** Add voice signal dispatch to accept/reject/edit handlers in `renderReading()`.

**3d.** Demote the .2i `intelligence` field from authoritative to cache. Add a `cache_source: "local" | "pubpartner"` and `cache_timestamp` field. 2i reads and displays it; PubPartner writes it.

**3e.** On document open, if PubPartner is connected, fetch fresh intelligence and update the cache. If offline, display the cache with a "cached — PubPartner offline" indicator.

### Critical: DO NOT remove the local indexer/continuity code from 2i yet.

It serves as:
- the offline fallback;
- the only working implementation until PubPartner endpoints are built and tested;
- the reference implementation for the PubPartner port.

Remove it only after the PubPartner implementation is verified end-to-end.

---

## E. OPTIONAL IMPROVEMENTS (not required for architecture migration)

- Scene navigation in status bar (Scene N of M + prev/next)
- Visual polish (parchment aging, corner ornaments)
- .docx export
- Chapter modal (replace `prompt()`)
- Word count target setting
- Style profile "analyze my voice" button
- Cross-manuscript character references in PubPartner

---

## F. DO NOT TOUCH

- The LLM adapter pattern (4 providers, consistent interface)
- The PubPartner chat adapter (correctly shaped for turns/live)
- The solo/collab mode architecture
- The IndexedDB autosave mechanism
- The .2i file format (extend, don't replace)
- The CSS design token system and visual identity
- The canvas rendering (lantern + spine)
- The fuzzy dedup algorithms (port to Python, don't redesign)
- The type-safe merge logic (port to Python, don't redesign)
- The keyboard shortcuts
- The undo/redo stack
- The reference archive
- PubPartner's existing turn architecture
- PubPartner's vessel/persistence layer
- The governance engine

---

## G. REVISED BUILD PLAN

### Phase 1 — Intelligence Contract (3-5 days)

- [ ] Define commit event schema (protocol_version, revision_id, chapter_hashes, content)
- [ ] Define generation request schema
- [ ] Define voice signal schema
- [ ] Define intelligence retrieval response schema
- [ ] Document cache semantics for .2i intelligence field
- [ ] Add `cache_source` and `cache_timestamp` to intelligence schema

### Phase 2 — PubPartner Manuscript Intelligence (1-2 weeks)

- [ ] Create `manuscript_routes.py` with 4 endpoints
- [ ] Port `runIndexer` logic to `manuscript_indexer.py`
- [ ] Port `mergeChapterIndex` to Python with same type-safety
- [ ] Port `runContinuityCheck` to `manuscript_continuity.py`
- [ ] Port `wordSimilarity` + fuzzy dedup to Python
- [ ] Port `resolveFixedFlags` to Python
- [ ] Store indexer results in cartridge via vessel layer
- [ ] Store continuity flags in cartridge
- [ ] Test with real LLM against 5+ chapter manuscript
- [ ] Verify cartridge persistence across server restarts

### Phase 3 — Voice Intelligence (1 week)

- [ ] Create `manuscript_voice.py`
- [ ] Accept/reject/rewrite storage in cartridge
- [ ] Style analyzer prompt (run on 3000-word sample)
- [ ] Composite generation prompt construction (style + voice + intelligence)
- [ ] FIFO cap on example arrays
- [ ] Wire generation endpoint to use voice data

### Phase 4 — End-to-End Pipeline (1 week)

- [ ] Wire 2i `approveBuffer()` to send commit events
- [ ] Wire 2i `saveDocument()` to send commit events
- [ ] Wire 2i generation to use PubPartner endpoint when available
- [ ] Wire accept/reject/edit to send voice signals
- [ ] Wire document open to fetch fresh intelligence from PubPartner
- [ ] Verify offline fallback (local indexer still works)
- [ ] Verify full pipeline: commit → index → cartridge → generate → accept → learn

### Phase 5 — Release Hardening (1 week)

- [ ] Test with 20-chapter manuscript — performance and accuracy
- [ ] Verify data integrity (no silent loss on crash/disconnect)
- [ ] Verify recovery (autosave, PubPartner reconnect)
- [ ] Security review (API key handling, cartridge access)
- [ ] Loading/error/offline state indicators
- [ ] Documentation (HANDOFF, README, API docs)
- [ ] Package for distribution

**Total: 4-6 weeks. Down from 6-7 because there's no sync layer.**

---

## H. RISK REGISTER

| Risk | Severity | Mitigation |
|---|---|---|
| Claude browser CORS blocks production demo | Critical | Route generation through PubPartner (which is the intended architecture anyway) |
| Porting indexer to Python introduces regressions | High | Keep 2i's JS version as reference and fallback; compare outputs |
| PubPartner endpoint latency adds delay to commit flow | Medium | Make commit dispatch async/fire-and-forget; never block the writer |
| Cartridge grows unbounded with many manuscripts | Medium | Implement age-based pruning for low-value intelligence (info flags, stale timeline entries) |
| Voice training biases toward model's own patterns | Medium | Rewrite pairs (human corrections) carry higher weight than accepts |
| Offline → online transition loses queued commits | Low | Queue commits in IndexedDB; drain on reconnect |

---

## I. STOP LIST — Do Not Touch Yet

1. **Do not move the indexer/continuity code out of 2i until PubPartner endpoints are built and tested.** It is the only working implementation. Removing it before the replacement exists creates a gap.

2. **Do not redesign the .2i file format.** v5 is correct. Add `cache_source` and `cache_timestamp` fields. That's it.

3. **Do not refactor PubPartner's vessel/persistence layer.** Use it as-is for cartridge storage.

4. **Do not build a PubCast ↔ 2i bridge yet.** Get the 2i ↔ PubPartner pipeline working first.

5. **Do not optimize indexer prompt templates.** Get the pipeline end-to-end first. Tune prompts during Phase 5.

6. **Do not implement cross-manuscript intelligence.** Single-manuscript intelligence through the cartridge first. Cross-manuscript is a Phase 6+ feature.

7. **Do not touch the visual design.** Polish comes after the intelligence pipeline works.

---

## J. THREE HIGHEST-VALUE NEXT ACTIONS

### 1. Test v26 with a real LLM

Configure OpenAI or local Ollama. Write 3+ chapters. Commit them. Verify:
- Indexer runs and extracts characters/plots/locations
- Continuity flags appear for genuine issues
- Flags can be dismissed/deferred/resolved
- Generation works in collab mode

This validates that 6 "awaiting configuration" features are genuinely functional. Until this is done, they're implemented but unverified.

### 2. Build the manuscript commit endpoint in PubPartner

One new route: `POST /api/pubpartner/manuscript/commit`. Accept the commit event, store it, and trigger indexing using the ported indexer logic. This is the first real step toward the single-authority model.

The indexer logic is already written in JavaScript. Port `mergeChapterIndex`, `djb2Hash`, `asString/asArray/slugify`, and the `INDEXER_SYSTEM_PROMPT` to Python. They're pure functions — the port is mechanical.

### 3. Wire 2i's `approveBuffer()` to send a commit event

When the writer commits a scene, 2i sends the commit event to PubPartner (if connected). This closes the first loop: writer commits → PubPartner learns. Generation and voice training come after this works.

These three actions, in order, convert the architecture from "2i does everything locally" to "2i and PubPartner collaborate with PubPartner as the intelligence authority" — which is exactly the target state.

---

*Audit by Opus for Rear View Foresight LLC*
*Fact, inference, and recommendation distinguished throughout.*
*Feic Mo Chroí™*
