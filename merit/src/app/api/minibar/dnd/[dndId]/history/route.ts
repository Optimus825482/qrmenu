import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { dndHistory } from "@/modules/minibar/server/dnd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ dndId: string }> }) {
  return handle(async (ctx) => {
    const { dndId } = await props.params;
    return dndHistory(ctx, dndId);
  });
}
