---
name: supabase-migrate
description: Run a Keiro Supabase schema change through the manual dashboard flow and auto-verify it landed via anon REST probes. Use whenever SQL must be run in the Supabase dashboard — new tables/columns/policies/RPCs, or when checking whether a migration was actually applied.
---

# Supabase Migrate

There is no CLI/CI path to the database — the user runs SQL in the dashboard SQL editor, and the dashboard assistant sometimes REWRITES the SQL before it runs. So: hand off self-healing SQL, then verify the live schema yourself. Never assume; never rely on memory of whether a migration "was already run" (probe instead — the user has been told "you still need to run X" when they already had).

## Steps

1. **Write/extend the checked-in SQL file** (`supabase-*.sql`). It must be idempotent AND self-healing:
   - `create table if not exists`, `alter table … add column if not exists`
   - `drop policy if exists <every earlier variant name>` before `create policy`
   - safe to re-run top to bottom, always.
2. **Hand off one copy-paste block.** Give the user the full file contents in a single fenced block with: "Paste into Supabase dashboard → SQL editor → Run. Tell me when it's done." Nothing else in the block — no options, no alternatives.
3. **Probe the live schema after they confirm** (and also *before* step 2 if the question is "did I already run this?"):
   ```bash
   set -a; for f in .env.local .env; do [ -f "$f" ] && source "$f"; done; set +a
   [ -n "$VITE_SUPABASE_URL" ] && [ -n "$VITE_SUPABASE_ANON_KEY" ] || { echo "ERROR: no Supabase creds in .env.local or .env — probe aborted"; return 1 2>/dev/null || exit 1; }
   curl -s "$VITE_SUPABASE_URL/rest/v1/<table>?select=<critical_column>&limit=1" \
     -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
   ```
   (The repo currently keeps live credentials in `.env`; `.env.local` is the documented convention and wins when present. The guard makes an empty-URL curl impossible to misread as "table missing".)
   - `[]` or rows → column exists ✅
   - `"code":"42703"` → column missing; `"code":"42P01"` → table missing
   - Probe every column/table the migration was supposed to create, not just one.
   - RLS note: an empty `[]` proves schema, not policy. For policies/RPCs, probe the RPC (`POST /rest/v1/rpc/<fn>`) with a harmless payload and check the error class.
4. **If a probe fails**, the dashboard assistant likely rewrote the SQL. Ask the user to paste back exactly what the editor shows, diff it against the file, and re-hand-off the corrected block.
5. **Report** a checklist of probed objects with ✅/❌ per item.

## Security

Never ask for, accept, or echo Supabase access tokens (`sbp_…`) or the service-role key. The anon key from `.env.local` is sufficient for probing. If the user pastes a privileged token into chat, tell them to rotate it immediately — chat transcripts persist on disk.
