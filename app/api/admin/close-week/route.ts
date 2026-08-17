import { NextRequest, NextResponse } from 'next/server';
import { closeWeek } from '@/lib/closeWeek';
import { withApiErrors } from '@/lib/apiHandler';

// Chốt TOP 7 thủ công (dùng khi cần chốt lại 1 tuần cụ thể ngoài lịch cron,
// hoặc sau khi admin override 1 món qua SQL Editor). Chốt tự động hàng tuần
// đã có ở app/api/cron/close-week (Vercel Cron, xem vercel.json).
//
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

  const result = await closeWeek(weekId);
  return NextResponse.json({ ok: true, weekId, ...result });
});
