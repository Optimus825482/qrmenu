import { requireUser } from "@/lib/auth";
import { visibleScreens } from "@/lib/rbac";
import KatDashboard, { type KatFilter } from "./KatDashboard";

export const dynamic = "force-dynamic";

/** Floor home: the layout already guards MB-KAT; here the shortcuts are limited to permitted screens. */
export default async function KatPage({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string | string[] }>;
}) {
  const ctx = await requireUser();
  const visible = new Set(await visibleScreens(ctx));
  const raw = (await searchParams).filtre;
  const filtre = typeof raw === "string" ? raw : undefined;
  // The filters are the catalogue's MB-PERS / MB-DND screens: only for users who may view them.
  const filter: KatFilter =
    filtre === "mybar" && visible.has("MB-PERS") ? "mybar" : filtre === "dnd" && visible.has("MB-DND") ? "dnd" : null;
  return (
    <KatDashboard
      filter={filter}
      links={{
        occupancy: visible.has("MB-DOL"),
        definitions: visible.has("MB-TAN"),
        stock: visible.has("MB-ZIM"),
        reports: visible.has("MB-RAP"),
      }}
    />
  );
}
