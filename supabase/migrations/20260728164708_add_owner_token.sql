-- Scopes history to one anonymous visitor.
--
-- The table had no notion of "whose" row something was, so /history and the
-- homepage's recent-analyses list showed every analysis anyone had ever run on the
-- deployment, in full — resume file names, scores, and the entire report content
-- for anyone who opened the right id. owner_token is a random id set in a cookie
-- the first time a visitor analyzes something (see src/lib/ownerToken.ts); every
-- list/delete-all operation is scoped to it from here on.
--
-- Left nullable rather than backfilled: rows written before this column existed
-- have no reliable owner to assign them to, and `owner_token = $token` already
-- excludes NULL rows from every scoped query on its own — they simply stop
-- appearing in anyone's history list, which is the correct outcome for data no
-- visitor can be shown to actually own.
--
-- A single report's own /r/[id] link and its PDF/rewrite/cover-letter downloads
-- stay unscoped by owner on purpose — those were always meant to be sharable by
-- whoever holds the link, the same trust model a Google Doc "anyone with the link"
-- share uses, and that has not changed.
alter table public.analyses add column if not exists owner_token text;

create index if not exists analyses_owner_token_idx
  on public.analyses (owner_token, created_at desc);
