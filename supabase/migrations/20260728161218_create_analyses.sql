-- Analysis history store.
--
-- Replaces a local JSON file (./data/history.json) that worked fine for `next dev`
-- but silently failed on Vercel: serverless functions there run on a read-only
-- filesystem, so every write threw, was swallowed on purpose (a storage hiccup must
-- never fail the analysis the user just waited for), and every report vanished the
-- moment you navigated away from it.
--
-- `data` holds the full analysis (AnyResult, as returned to the browser) verbatim —
-- the report page, PDF export, and rewrite/cover-letter downloads all read it back
-- unchanged. The other columns duplicate just enough of it (kind/url/final_url/title/
-- analyzed_at/overall_score/grade) to serve the history list and the trend lookup
-- without deserializing every stored report to build them.
create table if not exists public.analyses (
  id text primary key,
  kind text not null check (kind in ('website', 'resume', 'document')),
  url text not null,
  final_url text not null,
  title text not null,
  analyzed_at timestamptz not null,
  overall_score integer not null,
  grade text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Trend lookups match on either url or final_url, scoped to one kind (see
-- src/lib/history.ts's getTrend) — a resume upload named "portfolio.pdf" must never
-- land on the trend line for a website at that same string.
create index if not exists analyses_kind_final_url_idx on public.analyses (kind, final_url);
create index if not exists analyses_kind_url_idx on public.analyses (kind, url);

-- The history list and the "keep only the most recent 50" trim both order by this.
create index if not exists analyses_created_at_idx on public.analyses (created_at desc);

-- This app is single-user with no login, and the server only ever talks to this
-- table with the service-role key (which bypasses RLS regardless). RLS is enabled
-- anyway, with no policies, purely so the table stays unreachable through the
-- anon/public key if one is ever added to this project for something else.
alter table public.analyses enable row level security;
