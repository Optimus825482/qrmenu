import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { suggestRequest } from "@/modules/minibar/server/stockRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle((ctx) => suggestRequest(ctx));
}
