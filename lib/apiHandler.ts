import { NextResponse } from 'next/server';

// Any route handler can throw (missing env vars, Supabase hiccup, bug) —
// without this, Next.js falls back to an HTML error page, and the client's
// `await res.json()` blows up with a confusing "Unexpected end of JSON
// input" instead of a clean error message. Wrap every route with this so
// failures always come back as { error } JSON.
export function withApiErrors<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error('API error:', err);
      const message = err instanceof Error ? err.message : 'Đã có lỗi xảy ra, vui lòng thử lại.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
