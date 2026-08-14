import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withApiErrors } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

// PRD 4.4 / Screen 07: chỉ mở sau khi user đã gửi cả 2 menu — chặn ở tầng API,
// 403 nếu vote.status != COMPLETED (không chỉ chặn ở frontend).
export const GET = withApiErrors(async (req: NextRequest) => {
  const voteId = req.nextUrl.searchParams.get('voteId');
  if (!voteId) return NextResponse.json({ error: 'Thiếu voteId.' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: vote, error } = await db.from('votes').select('id,week_id,status').eq('id', voteId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!vote) return NextResponse.json({ error: 'Không tìm thấy phiếu bầu.' }, { status: 404 });

  if (vote.status !== 'COMPLETED' && vote.status !== 'LOCKED') {
    return NextResponse.json(
      { error: 'Hãy gửi đủ Menu Cơm và Menu Ăn sáng để xem bảng xếp hạng.' },
      { status: 403 }
    );
  }

  const [{ data: counts, error: countsErr }, { data: myItems, error: myItemsErr }, { data: foods, error: foodsErr }] =
    await Promise.all([
      db.from('vote_counts').select('food_id,menu_type,vote_count').eq('week_id', vote.week_id),
      db.from('vote_items').select('food_id,menu_type').eq('vote_id', voteId),
      db.from('foods').select('id,name,image_url,category').eq('is_active', true)
    ]);
  if (countsErr) return NextResponse.json({ error: countsErr.message }, { status: 500 });
  if (myItemsErr) return NextResponse.json({ error: myItemsErr.message }, { status: 500 });
  if (foodsErr) return NextResponse.json({ error: foodsErr.message }, { status: 500 });

  const countMap = new Map((counts ?? []).map((c) => [c.food_id, c.vote_count]));
  const mySet = new Set((myItems ?? []).map((i) => i.food_id));

  function buildCategory(category: 'rice' | 'breakfast') {
    return (foods ?? [])
      .filter((f) => f.category === category)
      .map((f) => ({
        id: f.id,
        name: f.name,
        image: f.image_url,
        voteCount: countMap.get(f.id) ?? 0,
        mine: mySet.has(f.id)
      }))
      .sort((a, b) => b.voteCount - a.voteCount);
  }

  const rice = buildCategory('rice');
  const breakfast = buildCategory('breakfast');
  const myRiceHits = rice.slice(0, 7).filter((m) => m.mine).length;
  const myBreakfastHits = breakfast.slice(0, 7).filter((m) => m.mine).length;

  return NextResponse.json({
    rice,
    breakfast,
    myRiceHits,
    myBreakfastHits
  });
});
