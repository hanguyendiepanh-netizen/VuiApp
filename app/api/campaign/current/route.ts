import { NextResponse } from 'next/server';
import { getCurrentCampaign } from '@/lib/campaign';
import { withApiErrors } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

export const GET = withApiErrors(async () => {
  const campaign = await getCurrentCampaign();
  if (!campaign) {
    return NextResponse.json({ error: 'No campaign configured' }, { status: 404 });
  }
  return NextResponse.json(campaign);
});
