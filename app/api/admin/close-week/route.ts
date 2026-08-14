import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withApiErrors } from '@/lib/apiHandler';

// Chốt TOP 7 (handoff doc, việc cần làm #5): lấy top 7 món/category theo
// vote_count giảm dần, ghi vào official_menu. Gọi tay hoặc qua cron (Vercel
// Cron / Supabase Cron) vào thứ Sáu hàng tuần sau vote_deadline_at.
//
// Bảo vệ bằng secret header vì PRD chưa có hệ thống đăng nhập admin:
//   curl -X POST https://<app>/api/admin/close-week \
//     -H "x-admin-secret: $ADMIN_SECRET" -H "content-type: application/json" \
//     -d '{"weekId":"W1-2026"}'
export const POST = withApiErrors(async (req: NextRequest) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers.get('x-admin-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { weekId } = (await req.json()) as { weekId?: string };
  if (!weekId) return NextResponse.json({ error: 'Thiếu weekId.' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: counts, error: countsErr } = await db
    .from('vote_counts')
    .select('food_id,menu_type,vote_count')
    .eq('week_id', weekId);
  if (countsErr) return NextResponse.json({ error: countsErr.message }, { status: 500 });

  const { data: existing, error: existingErr } = await db
    .from('official_menu')
    .select('food_id')
    .eq('week_id', weekId)
    .eq('is_override', true);
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
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

  // Clear previous auto rows for this week (keep manual overrides) then insert fresh.
  const { error: delErr } = await db
    .from('official_menu')
    .delete()
    .eq('week_id', weekId)
    .eq('is_override', false);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (rows.length > 0) {
    const { error: insErr } = await db.from('official_menu').insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, riceCount: top7('rice').length, breakfastCount: top7('breakfast').length });
});
