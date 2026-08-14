import { supabaseAdmin } from './supabaseAdmin';

export type CampaignStatus =
  | 'UPCOMING'
  | 'VOTING_OPEN'
  | 'VOTING_CLOSED'
  | 'PROCESSING_RESULT'
  | 'MENU_LOCKED'
  | 'RESULT_PUBLISHED';

export interface Campaign {
  week_id: string;
  label: string;
  range_text: string;
  vote_start_at: string;
  vote_deadline_at: string;
  lock_at: string;
  publish_at: string;
  pick_count: number;
  max_score: number;
  rewards: number[];
}

export interface CampaignWithStatus extends Campaign {
  status: CampaignStatus;
}

// Status is derived from the configured timestamps, never from the client's
// clock (PRD 4.1: "Trạng thái do backend trả về theo mốc thời gian cấu hình").
export async function resolveCampaignStatus(c: Campaign): Promise<CampaignStatus> {
  const now = Date.now();
  const start = Date.parse(c.vote_start_at);
  const deadline = Date.parse(c.vote_deadline_at);
  const lock = Date.parse(c.lock_at);
  const publish = Date.parse(c.publish_at);

  if (now < start) return 'UPCOMING';
  if (now < deadline) return 'VOTING_OPEN';
  if (now < publish) {
    const { count } = await supabaseAdmin()
      .from('official_menu')
      .select('week_id', { count: 'exact', head: true })
      .eq('week_id', c.week_id);
    if (count && count > 0) return 'MENU_LOCKED';
    return now < lock ? 'VOTING_CLOSED' : 'PROCESSING_RESULT';
  }
  return 'RESULT_PUBLISHED';
}

// "Current" week = the most recently started campaign that hasn't been
// superseded by a newer one. Simple heuristic: latest vote_start_at.
export async function getCurrentCampaign(): Promise<CampaignWithStatus | null> {
  const { data, error } = await supabaseAdmin()
    .from('campaigns')
    .select('*')
    .order('vote_start_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const status = await resolveCampaignStatus(data as Campaign);
  return { ...(data as Campaign), status };
}

export async function getCampaignByWeekId(weekId: string): Promise<CampaignWithStatus | null> {
  const { data, error } = await supabaseAdmin()
    .from('campaigns')
    .select('*')
    .eq('week_id', weekId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const status = await resolveCampaignStatus(data as Campaign);
  return { ...(data as Campaign), status };
}
