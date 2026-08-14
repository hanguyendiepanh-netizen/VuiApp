import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withApiErrors } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

export const GET = withApiErrors(async (req: NextRequest) => {
  const voteId = req.nextUrl.searchParams.get('voteId');
  if (!voteId) return NextResponse.json({ error: 'Thiếu voteId.' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: vote, error } = await db.from('votes').select('*').eq('id', voteId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!vote) return NextResponse.json({ error: 'Không tìm thấy phiếu bầu.' }, { status: 404 });

  const { data: items, error: itemsErr } = await db
    .from('vote_items')
    .select('food_id,menu_type')
    .eq('vote_id', voteId);
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  return NextResponse.json({
    voteId: vote.id,
    weekId: vote.week_id,
    status: vote.status,
    draftRice: vote.draft_rice ?? [],
    draftBreakfast: vote.draft_breakfast ?? [],
    submittedRice: (items ?? []).filter((i) => i.menu_type === 'rice').map((i) => i.food_id),
    submittedBreakfast: (items ?? []).filter((i) => i.menu_type === 'breakfast').map((i) => i.food_id),
    riceSubmittedAt: vote.rice_submitted_at,
    breakfastSubmittedAt: vote.breakfast_submitted_at,
    completedAt: vote.completed_at
  });
});
