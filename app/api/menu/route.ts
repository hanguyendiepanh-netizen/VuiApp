import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withApiErrors } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

export const GET = withApiErrors(async (req: NextRequest) => {
  const category = req.nextUrl.searchParams.get('category'); // 'rice' | 'breakfast' | null

  let query = supabaseAdmin()
    .from('foods')
    .select('id,name,category,image_url,display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (category === 'rice' || category === 'breakfast') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data });
});
