import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { expiryLoginSummary } from "@/modules/minibar/server/expiryAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SKT state of the caller's hotels for the sign-in notice (minibar system manager / system administrator only). */
export async function GET() {
  return handle((ctx) => expiryLoginSummary(ctx));
}
