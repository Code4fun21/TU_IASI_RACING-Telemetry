import { Context, Next } from 'hono';

// Free Tier Limits (Source: Cloudflare Docs)
const LIMITS = {
  D1_WRITES_DAILY: 100000,       //
  D1_READS_DAILY: 5000000,       //
  R2_UPLOADS_MONTHLY: 1000000,   // Class A Operations
  R2_DOWNLOADS_MONTHLY: 10000000 // Class B Operations
};

type LimitType = 'd1_writes' | 'd1_reads' | 'r2_uploads' | 'r2_downloads';

export const usageGuardMiddleware = (type: LimitType) => {
  return async (c: Context, next: Next) => {
    const db = c.env.DB;

    // 1. CHECK: Can we proceed?
    const result = await db.prepare(
      "SELECT count, last_reset FROM system_limits WHERE id = ?"
    ).bind(type).first() as { count: number, last_reset: string } | null;

    if (result) {
      const now = new Date();
      const lastReset = new Date(result.last_reset);
      let shouldReset = false;

      // Logic: D1 is Daily, R2 is Monthly
      if (type.startsWith('d1')) {
        shouldReset = now.toISOString().split('T')[0] !== result.last_reset; // New Day
      } else {
        shouldReset = now.getMonth() !== lastReset.getMonth(); // New Month
      }

      if (!shouldReset) {
        // Determine which limit to check against
        let limit = 0;
        switch (type) {
            case 'd1_writes': limit = LIMITS.D1_WRITES_DAILY; break;
            case 'd1_reads': limit = LIMITS.D1_READS_DAILY; break;
            case 'r2_uploads': limit = LIMITS.R2_UPLOADS_MONTHLY; break;
            case 'r2_downloads': limit = LIMITS.R2_DOWNLOADS_MONTHLY; break;
        }

        if (result.count >= limit) {
          return c.json({ 
            error: "System Overload", 
            message: `Limit reached for ${type}. Please try again later.` 
          }, 429);
        }
      }
    }

    // 2. PROCEED: Run the actual route handler
    await next();

    // 3. INCREMENT: Update counter in background
    const nowStr = new Date().toISOString().split('T')[0];
    const promise = db.prepare(`
        UPDATE system_limits 
        SET count = CASE WHEN last_reset < ? THEN 1 ELSE count + 1 END,
        last_reset = ?
        WHERE id = ?
    `).bind(nowStr, nowStr, type).run();
    
    c.executionCtx.waitUntil(promise);
  };
};