-- ============================================================================
-- "Tuần tới ăn gì?" — Vui App x Yokowo
-- Initial schema. Run once in Supabase SQL Editor (or `supabase db push`).
-- Based on handoff-database-tuan-toi-an-gi.md + PRD section 7 (Data Model).
-- ============================================================================

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 1. campaigns — one row per weekly cycle ("Campaign / Week" in PRD 7)
-- ----------------------------------------------------------------------------
create table if not exists campaigns (
  week_id           text primary key,               -- 'W1-2026'
  label             text not null,                   -- 'Tuần 1'
  range_text        text not null,                   -- '01/09 – 05/09'
  vote_start_at     timestamptz not null,
  vote_deadline_at  timestamptz not null,             -- Thứ Năm 23h59
  lock_at           timestamptz not null,             -- Thứ Sáu, chốt TOP 7
  publish_at        timestamptz not null,             -- Thứ Bảy, công bố
  status text not null default 'UPCOMING'
    check (status in ('UPCOMING','VOTING_OPEN','VOTING_CLOSED','PROCESSING_RESULT','MENU_LOCKED','RESULT_PUBLISHED')),
  pick_count        int not null default 7,
  max_score         int not null default 14,
  rewards           int[] not null default '{200000,150000,100000}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Only one campaign should be "current" at a time from the app's point of view,
-- but we don't enforce that in SQL — /api/campaign/current picks the latest
-- non-UPCOMING-in-the-past row (see app/api/campaign/current/route.ts).

-- ----------------------------------------------------------------------------
-- 2. foods — food catalog, reused across weeks
-- ----------------------------------------------------------------------------
create table if not exists foods (
  id             text primary key,                  -- 'r01', 'b01', ...
  name           text not null,
  category       text not null check (category in ('rice','breakfast')),
  image_url      text,                               -- CDN/storage URL (or temp base64 data URI)
  display_order  int not null default 0,
  is_active      boolean not null default true,
  image_size_kb  int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_foods_category on foods (category, is_active, display_order);

-- ----------------------------------------------------------------------------
-- 3. weekly_menu_config — which foods are candidates for which week
--    (optional: if empty for a week, API falls back to "all active foods")
-- ----------------------------------------------------------------------------
create table if not exists weekly_menu_config (
  week_id       text not null references campaigns(week_id) on delete cascade,
  food_id       text not null references foods(id) on delete cascade,
  category      text not null check (category in ('rice','breakfast')),
  is_candidate  boolean not null default true,
  primary key (week_id, food_id)
);

-- ----------------------------------------------------------------------------
-- 4. votes — one row per (week, employee). Draft selections live here as
--    arrays and are freely overwritable; once a menu is submitted its items
--    move into vote_items (immutable, enforced by app + unique constraint).
-- ----------------------------------------------------------------------------
create table if not exists votes (
  id                    uuid primary key default gen_random_uuid(),
  week_id               text not null references campaigns(week_id) on delete cascade,
  employee_id           text not null,
  full_name             text not null,
  phone                 text not null,
  consent               boolean not null default false,
  consent_at            timestamptz,
  consent_ip            text,
  draft_rice            text[] not null default '{}',
  draft_breakfast       text[] not null default '{}',
  status text not null default 'DRAFT'
    check (status in ('DRAFT','RICE_SUBMITTED','COMPLETED','LOCKED')),
  rice_submitted_at      timestamptz,
  breakfast_submitted_at timestamptz,
  completed_at           timestamptz,                -- = breakfast_submitted_at
  is_valid                boolean not null default true,
  invalid_reason           text,
  created_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (week_id, employee_id)                       -- 1 phiếu / nhân viên / tuần
);

create index if not exists idx_votes_week_status on votes (week_id, status);

-- ----------------------------------------------------------------------------
-- 5. vote_items — the 7+7 committed (submitted) items of a vote. Rows are
--    only inserted at submit time, so COUNT() on this table = real vote counts.
-- ----------------------------------------------------------------------------
create table if not exists vote_items (
  id         bigint generated always as identity primary key,
  vote_id    uuid not null references votes(id) on delete cascade,
  food_id    text not null references foods(id),
  menu_type  text not null check (menu_type in ('rice','breakfast')),
  unique (vote_id, food_id)
);

create index if not exists idx_vote_items_vote on vote_items (vote_id);
create index if not exists idx_vote_items_food on vote_items (food_id);

-- ----------------------------------------------------------------------------
-- 6. official_menu — TOP 7 per category per week, after Friday lock
-- ----------------------------------------------------------------------------
create table if not exists official_menu (
  week_id      text not null references campaigns(week_id) on delete cascade,
  category     text not null check (category in ('rice','breakfast')),
  food_id      text not null references foods(id),
  rank         int not null check (rank between 1 and 7),
  is_override  boolean not null default false,
  locked_at    timestamptz not null default now(),
  primary key (week_id, category, food_id)
);

create unique index if not exists idx_official_menu_rank
  on official_menu (week_id, category, rank);

-- ----------------------------------------------------------------------------
-- vote_counts — VIEW (not a physical table). Always in sync with vote_items,
-- no trigger maintenance needed. Only counts SUBMITTED (immutable) items.
-- ----------------------------------------------------------------------------
create or replace view vote_counts as
select
  v.week_id,
  vi.food_id,
  vi.menu_type,
  count(*)::int as vote_count
from vote_items vi
join votes v on v.id = vi.vote_id
where v.is_valid
group by v.week_id, vi.food_id, vi.menu_type;

-- ----------------------------------------------------------------------------
-- Row Level Security: all writes/reads for votes go through the server
-- (service_role key in API routes), never directly from the browser.
-- Enable RLS with no public policies = only service_role can touch these.
-- ----------------------------------------------------------------------------
alter table campaigns enable row level security;
alter table foods enable row level security;
alter table weekly_menu_config enable row level security;
alter table votes enable row level security;
alter table vote_items enable row level security;
alter table official_menu enable row level security;

-- Public (anon) read-only access to the food catalog + campaign status is fine
-- since it contains no personal data — lets the frontend read it directly too
-- if you ever want to skip the API layer for these two.
-- (drop-then-create so this script is safe to re-run)
drop policy if exists "public read foods" on foods;
drop policy if exists "public read campaigns" on campaigns;
create policy "public read foods" on foods for select using (is_active = true);
create policy "public read campaigns" on campaigns for select using (true);
