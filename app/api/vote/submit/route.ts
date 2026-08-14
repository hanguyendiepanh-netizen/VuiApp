import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCampaignByWeekId } from '@/lib/campaign';
import { withApiErrors } from '@/lib/apiHandler';

interface SubmitBody {
  voteId: string;
  menuType: 'rice' | 'breakfast';
  items: string[];
}

export const POST = withApiErrors(async (req: NextRequest) => {
  const body = (await req.json()) as Partial<SubmitBody>;
  const { voteId, menuType, items } = body;

  if (!voteId || (menuType !== 'rice' && menuType !== 'breakfast') || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Body không hợp lệ.' }, { status: 400 });
  }
  const uniqueItems = [...new Set(items)];
  if (uniqueItems.length !== 7) {
    return NextResponse.json({ error: 'Phải chọn đúng 7 món để gửi.' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: vote, error: findErr } = await db.from('votes').select('*').eq('id', voteId).maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!vote) return NextResponse.json({ error: 'Không tìm thấy phiếu bầu.' }, { status: 404 });

  const campaign = await getCampaignByWeekId(vote.week_id);
  if (!campaign || campaign.status !== 'VOTING_OPEN') {
    return NextResponse.json({ error: 'Cổng bình chọn đã đóng.' }, { status: 403 });
  }

  if (menuType === 'rice' && vote.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Menu Cơm đã được gửi rồi.' }, { status: 409 });
  }
  if (menuType === 'breakfast') {
    if (vote.status === 'DRAFT') {
      return NextResponse.json({ error: 'Cần gửi Menu Cơm trước.' }, { status: 409 });
    }
    if (vote.status === 'COMPLETED' || vote.status === 'LOCKED') {
      return NextResponse.json({ error: 'Menu Ăn sáng đã được gửi rồi.' }, { status: 409 });
    }
  }

  // Validate items belong to the correct category and are active.
  const { data: foods, error: foodsErr } = await db
    .from('foods')
    .select('id,category')
    .in('id', uniqueItems);
  if (foodsErr) return NextResponse.json({ error: foodsErr.message }, { status: 500 });
  if (
    foods.length !== 7 ||
    foods.some((f) => f.category !== menuType)
  ) {
    return NextResponse.json({ error: 'Danh sách món không hợp lệ.' }, { status: 400 });
  }

  const { error: itemsErr } = await db
    .from('vote_items')
    .insert(uniqueItems.map((food_id) => ({ vote_id: voteId, food_id, menu_type: menuType })));
  if (itemsErr) {
    if (itemsErr.code === '23505') {
      return NextResponse.json({ error: 'Menu này đã được gửi rồi.' }, { status: 409 });
    }
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (menuType === 'rice') {
    patch.status = 'RICE_SUBMITTED';
    patch.rice_submitted_at = now;
  } else {
    patch.status = 'COMPLETED';
    patch.breakfast_submitted_at = now;
    patch.completed_at = now;
  }

  const { data: updated, error: updateErr } = await db
    .from('votes')
    .update(patch)
    .eq('id', voteId)
    .select('*')
    .single();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    status: updated.status,
    completedAt: updated.completed_at
  });
});
