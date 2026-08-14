import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withApiErrors } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

// "Nguyễn Thị Hoa" -> "Nguyễn Thị H." (PRD 6.5 — không public tên đầy đủ).
function maskName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(' ') + ' ' + parts[parts.length - 1].charAt(0) + '.';
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const GET = withApiErrors(async (req: NextRequest) => {
  const weekId = req.nextUrl.searchParams.get('weekId') ?? req.nextUrl.searchParams.get('week_id');
  const voteId = req.nextUrl.searchParams.get('voteId');
  if (!weekId) return NextResponse.json({ error: 'Thiếu weekId.' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: official, error: officialErr } = await db
    .from('official_menu')
    .select('category,food_id')
    .eq('week_id', weekId);
  if (officialErr) return NextResponse.json({ error: officialErr.message }, { status: 500 });
  if (!official || official.length === 0) {
    return NextResponse.json({ error: 'Menu tuần này chưa được chốt.' }, { status: 404 });
  }
  const officialIds = new Set(official.map((o) => o.food_id));

  const { data: votes, error: votesErr } = await db
    .from('votes')
    .select('id,full_name,completed_at')
    .eq('week_id', weekId)
    .eq('status', 'COMPLETED')
    .eq('is_valid', true);
  if (votesErr) return NextResponse.json({ error: votesErr.message }, { status: 500 });

  const { data: items, error: itemsErr } = await db
    .from('vote_items')
    .select('vote_id,food_id')
    .in('vote_id', (votes ?? []).map((v) => v.id).length ? (votes ?? []).map((v) => v.id) : ['__none__']);
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  const hitsByVote = new Map<string, number>();
  for (const it of items ?? []) {
    if (officialIds.has(it.food_id)) hitsByVote.set(it.vote_id, (hitsByVote.get(it.vote_id) ?? 0) + 1);
  }

  const players = (votes ?? [])
    .map((v) => ({
      voteId: v.id,
      name: maskName(v.full_name),
      score: hitsByVote.get(v.id) ?? 0,
      completedAtMs: v.completed_at ? Date.parse(v.completed_at) : Infinity,
      timeText: formatTime(v.completed_at)
    }))
    // PRD 6.3: điểm cao hơn xếp trên; bằng điểm -> hoàn tất sớm hơn xếp trên.
    .sort((a, b) => b.score - a.score || a.completedAtMs - b.completedAtMs)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const top10 = players.slice(0, 10).map(({ completedAtMs, voteId: pVoteId, ...rest }) => ({
    ...rest,
    isMe: voteId ? pVoteId === voteId : false
  }));

  let mine: (typeof players)[number] | undefined;
  if (voteId) mine = players.find((p) => p.voteId === voteId);

  return NextResponse.json({
    weekId,
    top10,
    myRank: mine
      ? { rank: mine.rank, score: mine.score, timeText: mine.timeText, inTop10: mine.rank <= 10 }
      : null
  });
});
