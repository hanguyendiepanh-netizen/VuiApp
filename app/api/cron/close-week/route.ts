import { NextRequest, NextResponse } from 'next/server';
import { closeWeek, findWeekToClose } from '@/lib/closeWeek';
import { withApiErrors } from '@/lib/apiHandler';

// Chạy tự động theo lịch trong vercel.json (crons). Vercel tự đính kèm
// header "Authorization: Bearer $CRON_SECRET" cho request từ cron — set
// CRON_SECRET trong Environment Variables để route này chỉ chạy khi được
// Vercel gọi, không ai gọi tay được (khác với /api/admin/close-week).
export const GET = withApiErrors(async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const weekId = await findWeekToClose();
  if (!weekId) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Không có tuần nào cần chốt lúc này.' });
  }

  const result = await closeWeek(weekId);
  return NextResponse.json({ ok: true, weekId, ...result });
});
