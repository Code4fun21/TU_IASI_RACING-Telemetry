// src/middleware/usageGuard.ts
import { Context, Next } from 'hono';

// Free Tier Limits
const LIMITS = {
  D1_WRITES_DAILY: 100000,
  R2_UPLOADS_MONTHLY: 1000000 
};

export const usageGuardMiddleware = (type: 'd1_writes' | 'r2_uploads') => {
  return async (c: Context, next: Next) => {
    const db = c.env.DB;

    // 1. CHECK: Can we proceed?
    // 1. CHECK: Can we proceed?
    const result = await db.prepare(
      "SELECT count, last_reset FROM system_limits WHERE id = ?"
    ).bind(type).first() as { count: number, last_reset: string } | null;
    
    if (result) {
      const now = new Date();
      const lastReset = new Date(result.last_reset);
      let shouldReset = false;

      // Reset Logic
      if (type === 'd1_writes') {
        shouldReset = now.toISOString().split('T')[0] !== result.last_reset; // New Day
      } else {
        shouldReset = now.getMonth() !== lastReset.getMonth(); // New Month
      }

      if (!shouldReset) {
        const limit = type === 'd1_writes' ? LIMITS.D1_WRITES_DAILY : LIMITS.R2_UPLOADS_MONTHLY;
        if (result.count >= limit) {
          return c.json({ 
            error: "System Overload", 
            message: `Daily/Monthly limit reached for ${type}. Try again later.` 
          }, 429);
        }
      }
    }

    // 2. PROCEED: Run the actual route handler
    await next();

    // 3. INCREMENT: Update counter in background (after response is sent)
    // We use c.executionCtx.waitUntil so the user doesn't wait for this DB write
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