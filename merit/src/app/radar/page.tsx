import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { getSettings } from "@/lib/settings";
import { denyScreen } from "@/modules/minibar/server/pageGuard";
import { parseWallViews } from "@/modules/radar/constants";
import { radarHotels } from "@/modules/radar/server/scope";
import { RadarRoot } from "@/modules/radar/ui/RadarRoot";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  duvar: z.string().optional(),
  otel: z.string().max(64).optional(),
  gorunumler: z.string().max(128).optional(),
  sure: z.coerce.number().optional(),
  outlet: z.string().max(64).optional(),
});

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RadarPage({ searchParams }: PageProps) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      redirect("/giris?next=%2Fradar");
    }
    throw error;
  }

  const hotels = await radarHotels(ctx);
  if (hotels.length === 0) {
    denyScreen("CR-RAD");
  }

  const rawParams = await searchParams;
  const flatParams: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    flatParams[k] = Array.isArray(v) ? v[0] : v;
  }
  const parsed = querySchema.safeParse(flatParams);
  const q = parsed.success ? parsed.data : {};

  const targetHotel =
    (q.otel ? hotels.find((h) => h.code.toUpperCase() === q.otel!.toUpperCase() || h.id === q.otel) : undefined) ??
    hotels.find((h) => h.id === ctx.session.hotelId) ??
    hotels[0]!;

  // `otel=ALL`: the wall of the whole complex (the stacked boards of every hotel); needs more than one hotel.
  const wholeComplex = q.otel?.toUpperCase() === "ALL" && hotels.length > 1;

  const settings = await getSettings(
    ["radar.wallViews", "radar.wallRotateSeconds", "radar.soundOnEscalation"],
    targetHotel.id,
  );

  // Only what the address pins is passed down: the hotel's own settings come with the snapshot, so a change in
  // the settings screen reaches a wall that is already open.
  const views = q.gorunumler ? parseWallViews(q.gorunumler) : undefined;
  const rotateSeconds =
    typeof q.sure === "number" && Number.isFinite(q.sure) ? Math.max(5, Math.min(300, Math.round(q.sure))) : undefined;

  return (
    <main style={{ width: "100vw", height: "100dvh", overflow: "hidden" }}>
      <h1 className="sr-only">Canlı Radar</h1>
      <RadarRoot
        mode="wall"
        initial={{
          hotels,
          hotelId: wholeComplex ? "ALL" : targetHotel.id,
          views,
          rotateSeconds,
          outletId: q.outlet,
          soundOnEscalation: settings["radar.soundOnEscalation"],
        }}
      />
    </main>
  );
}
