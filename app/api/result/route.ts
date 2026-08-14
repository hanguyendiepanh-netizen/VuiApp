import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withApiErrors } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

export const GET = withApiErrors(async (req: NextRequest) => {
  const weekId = req.nextUrl.searchParams.get('weekId') ?? req.nextUrl.searchParams.get('week_id');
  const voteId = req.nextUrl.searchParams.get('voteId');
  if (!weekId) return NextResponse.json({ error: 'Thiếu weekId.' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: official, error: officialErr } = await db
    .from('official_menu')
    .select('category,rank,food_id,foods(id,name,image_url)')
    .eq('week_id', weekId)
    .order('rank', { ascending: true });
  if (officialErr) return NextResponse.json({ error: officialErr.message }, { status: 500 });

  if (!official || official.length === 0) {
    return NextResponse.json({ error: 'Menu tuần này chưa được chốt.' }, { status: 404 });
  }

  const shape = (row: any) => ({ rank: row.rank, id: row.food_id, name: row.foods?.name, image: row.foods?.image_url });
  const rice = official.filter((r) => r.category === 'rice').map(shape);
  const breakfast = official.filter((r) => r.category === 'breakfast').map(shape);

  let myScore = null;
  if (voteId) {
    const { data: vote } = await db.from('votes').select('id,status,is_valid').eq('id', voteId).maybeSingle();
    if (vote && vote.is_valid && (vote.status === 'COMPLETED' || vote.status === 'LOCKED')) {
      const { data: myItems } = await db.from('vote_items').select('food_id,menu_type').eq('vote_id', voteId);
      const riceIds = new Set(rice.map((r) => r.id));
      const bfIds = new Set(breakfast.map((r) => r.id));
      const riceHits = (myItems ?? []).filter((i) => i.menu_type === 'rice' && riceIds.has(i.food_id)).length;
      const bfHits = (myItems ?? []).filter((i) => i.menu_type === 'breakfast' && bfIds.has(i.food_id)).length;
      myScore = { rice: riceHits, breakfast: bfHits, total: riceHits + bfHits };
    }
  }

  return NextResponse.json({ weekId, rice, breakfast, myScore });
});
