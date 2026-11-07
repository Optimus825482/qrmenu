import { createRateLimiter } from "@/lib/rate-limit";
import { EXPORT_RATE_PER_MINUTE } from "@/modules/reporting/constants";

/** Report exports per user and minute (in memory, per instance). Keyed by `ctx.user.id`. */
export const exportLimiter = createRateLimiter({ max: EXPORT_RATE_PER_MINUTE, windowMs: 60_000, maxKeys: 5_000 });
