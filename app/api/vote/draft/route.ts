import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCampaignByWeekId } from '@/lib/campaign';
import { withApiErrors } from '@/lib/apiHandler';

interface DraftBody {
  voteId: string;
  menuType: 'rice' | 'breakfast';
  items: string[];
}

export const POST = withApiErrors(async (req: NextRequest) => {
  const body = (await req.json()) as Partial<DraftBody>;
  const { voteId, menuType, items } = body;

  if (!voteId || (menuType !== 'rice' && menuType !== 'breakfast') || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Body không hợp lệ.' }, { status: 400 });
  }
  if (items.length > 7) {
    return NextResponse.json({ error: 'Không được chọn quá 7 món.' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: vote, error: findErr } = await db.from('votes').select('*').eq('id', voteId).maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!vote) return NextResponse.json({ error: 'Không tìm thấy phiếu bầu.' }, { status: 404 });

  const campaign = await getCampaignByWeekId(vote.week_id);
  if (!campaign || campaign.status !== 'VOTING_OPEN') {
    return NextResponse.json({ error: 'Cổng bình chọn hiện không mở.' }, { status: 403 });
  }

  const alreadySubmitted =
    (menuType === 'rice' && vote.status !== 'DRAFT') ||
    (menuType === 'breakfast' && (vote.status === 'COMPLETED' || vote.status === 'LOCKED'));
  if (alreadySubmitted) {
    return NextResponse.json({ error: 'Menu này đã được gửi, không thể sửa nháp.' }, { status: 409 });
  }

  const column = menuType === 'rice' ? 'draft_rice' : 'draft_breakfast';
  const { error: updateErr } = await db
    .from('votes')
    .update({ [column]: items, updated_at: new Date().toISOString() })
    .eq('id', voteId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
