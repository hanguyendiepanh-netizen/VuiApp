-- Seeds the demo week (matches CONFIG in the prototype HTML).
-- Edit the timestamps for your real launch week before running in prod.
insert into campaigns (
  week_id, label, range_text,
  vote_start_at, vote_deadline_at, lock_at, publish_at,
  status, pick_count, max_score, rewards
) values (
  'W1-2026', 'Tuần 1', '01/09 – 05/09',
  '2026-09-01T08:00:00+07:00',
  '2026-09-03T23:59:59+07:00',
  '2026-09-04T09:00:00+07:00',
  '2026-09-05T09:00:00+07:00',
  'VOTING_OPEN', 7, 14, '{200000,150000,100000}'
)
on conflict (week_id) do update set
  status = excluded.status,
  vote_start_at = excluded.vote_start_at,
  vote_deadline_at = excluded.vote_deadline_at,
  lock_at = excluded.lock_at,
  publish_at = excluded.publish_at;
