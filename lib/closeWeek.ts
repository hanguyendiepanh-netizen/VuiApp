import { supabaseAdmin } from './supabaseAdmin';

// Chốt TOP 7 (handoff doc, việc cần làm #5): lấy top 7 món/category theo
// vote_count giảm dần từ view vote_counts, ghi vào official_menu. Giữ
// nguyên các dòng admin đã override thủ công (is_override=true).
export async function closeWeek(weekId: string) {
  const db = supabaseAdmin();

  const { data: counts, error: countsErr } = await db
    .from('vote_counts')
    .select('food_id,menu_type,vote_count')
    .eq('week_id', weekId);
  if (countsErr) throw countsErr;

  const { data: existing, error: existingErr } = await db
    .from('official_menu')
    .select('food_id')
    .eq('week_id', weekId)
    .eq('is_override', true);
  if (existingErr) throw existingErr;
  const overriddenIds = new Set((existing ?? []).map((r) => r.food_id));

  function top7(menuType: 'rice' | 'breakfast') {
    return (counts ?? [])
      .filter((c) => c.menu_type === menuType && !overriddenIds.has(c.food_id))
      .sort((a, b) => b.vote_count - a.vote_count)
      .slice(0, 7);
  }

  const rows = [
    ...top7('rice').map((c, i) => ({ week_id: weekId, category: 'rice', food_id: c.food_id, rank: i + 1, is_override: false })),
    ...top7('breakfast').map((c, i) => ({ week_id: weekId, category: 'breakfast', food_id: c.food_id, rank: i + 1, is_override: false }))
  ];

  const { error: delErr } = await db
    .from('official_menu')
    .delete()
    .eq('week_id', weekId)
    .eq('is_override', false);
  if (delErr) throw delErr;

  if (rows.length > 0) {
    const { error: insErr } = await db.from('official_menu').insert(rows);
    if (insErr) throw insErr;
  }

  return { riceCount: top7('rice').length, breakfastCount: top7('breakfast').length };
}

// Tìm tuần cần chốt tự động: đã qua lock_at, chưa qua publish_at, và chưa
// có official_menu (tránh chốt lại nhiều lần nếu cron chạy trễ/lặp).
export async function findWeekToClose(): Promise<string | null> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  const { data: campaigns, error } = await db
    .from('campaigns')
    .select('week_id,lock_at,publish_at')
    .lte('lock_at', now)
    .gt('publish_at', now)
    .order('lock_at', { ascending: false });
  if (error) throw error;
  if (!campaigns || campaigns.length === 0) return null;

  for (const c of campaigns) {
    const { count } = await db
      .from('official_menu')
      .select('week_id', { count: 'exact', head: true })
      .eq('week_id', c.week_id);
    if (!count || count === 0) return c.week_id;
  }
  return null;
}
