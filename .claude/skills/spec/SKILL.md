---
name: spec
description: Persist a large pasted spec to a file and work from it, so usage-limit stops, compactions, and session restarts never require re-pasting. Use whenever the user pastes a long multi-part spec/prompt (roughly 40+ lines or 3+ numbered work items), or says "continue from where you left off" on spec-driven work.
---

# Spec

Big pasted specs die with the session: limit stops and compactions have forced the user to re-paste the same multi-hundred-line spec 2–3 times. Fix: the file is the spec, the chat is just the trigger.

## On receiving a big spec

1. **Save it verbatim** to `docs/specs/<YYYY-MM-DD>-<short-slug>.md` before doing anything else. Do not summarize, reorder, or "clean up" the text — byte-for-byte, plus a small header:
   ```markdown
   <!-- saved by /spec on <date>; source: pasted in chat -->
   ## Status
   - [ ] item 1 — pending
   - [ ] item 2 — pending
   ```
   (Derive the checklist from the spec's own items; keep the original text below it, untouched.)
2. **Sanity-check the premises.** These specs are often written externally and drift from reality (e.g. "don't touch branch X" after X was merged). Diff each premise against the actual repo state; list any stale premises to the user before starting, and record the resolution in the Status block.
3. **Work from the file.** As each item lands (commit/PR), tick it in the Status block *in the same commit*.

## On resume ("continue from where you left off")

1. `ls -t docs/specs/ | head` → open the newest spec file(s) with unticked items.
2. Cross-check Status against git reality (`git log --oneline -15`, open PRs) — trust git over the checklist if they disagree, and fix the checklist.
3. Continue from the first genuinely unfinished item. Never ask the user to re-paste anything.

## Notes

- Commit files saved under `docs/specs/` — that's the point; they must survive the session (the directory itself is tracked via `docs/specs/README.md`).
- If the user re-pastes a spec that already exists in `docs/specs/`, say so, diff it against the saved copy, and continue from the saved Status rather than starting over.
