import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCampaignByWeekId } from '@/lib/campaign';
import { withApiErrors } from '@/lib/apiHandler';

interface RegisterBody {
  weekId: string;
  fullName: string;
  employeeId: string;
  phone: string;
  consent: boolean;
}

function shapeVote(vote: any) {
  return {
    voteId: vote.id,
    weekId: vote.week_id,
    fullName: vote.full_name,
    employeeId: vote.employee_id,
    status: vote.status,
    draftRice: vote.draft_rice ?? [],
    draftBreakfast: vote.draft_breakfast ?? [],
    riceSubmittedAt: vote.rice_submitted_at,
    breakfastSubmittedAt: vote.breakfast_submitted_at,
    completedAt: vote.completed_at
  };
}

export const POST = withApiErrors(async (req: NextRequest) => {
  const body = (await req.json()) as Partial<RegisterBody>;
  const { weekId, fullName, employeeId, phone, consent } = body;

  if (!weekId || !fullName?.trim() || !employeeId?.trim() || !phone?.trim() || consent !== true) {
    return NextResponse.json(
      { error: 'Thiếu thông tin bắt buộc (họ tên, mã nhân viên, SĐT, consent).' },
      { status: 400 }
    );
  }
  if (!/^[A-Za-z0-9]{4,12}$/.test(employeeId.trim())) {
    return NextResponse.json({ error: 'Mã nhân viên không hợp lệ.' }, { status: 400 });
  }
  if (!/^0[0-9]{9,10}$/.test(phone.trim())) {
    return NextResponse.json({ error: 'Số điện thoại không hợp lệ.' }, { status: 400 });
  }

  const campaign = await getCampaignByWeekId(weekId);
  if (!campaign) return NextResponse.json({ error: 'Tuần bình chọn không tồn tại.' }, { status: 404 });

  const db = supabaseAdmin();

  const { data: existing, error: findErr } = await db
    .from('votes')
    .select('*')
    .eq('week_id', weekId)
    .eq('employee_id', employeeId.trim())
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  if (existing) {
    return NextResponse.json({ returning: true, vote: shapeVote(existing) });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const { data: created, error: insertErr } = await db
    .from('votes')
    .insert({
      week_id: weekId,
      employee_id: employeeId.trim(),
      full_name: fullName.trim(),
      phone: phone.trim(),
      consent: true,
      consent_at: new Date().toISOString(),
      consent_ip: ip
    })
    .select('*')
    .single();

  if (insertErr) {
    // Unique (week_id, employee_id) race: someone else just registered this employeeId.
    if (insertErr.code === '23505') {
      const { data: race } = await db
        .from('votes')
        .select('*')
        .eq('week_id', weekId)
        .eq('employee_id', employeeId.trim())
        .maybeSingle();
      if (race) return NextResponse.json({ returning: true, vote: shapeVote(race) });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ returning: false, vote: shapeVote(created) });
});
