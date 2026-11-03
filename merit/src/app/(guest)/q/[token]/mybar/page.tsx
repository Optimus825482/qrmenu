import { getLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import { RoomMybar } from "@/modules/mybar/ui/guest/RoomHome";
import { getGuestTarget, getRoomPageState } from "../guestTarget";

export const dynamic = "force-dynamic";

/** `/q/{token}/mybar`: the MyBar form of a room QR (the chooser links here when room service is open too). */
export default async function RoomMybarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await getGuestTarget(token);
  if (target.kind !== "ROOM") notFound();
  const state = await getRoomPageState(target.roomId, target.hotelId);
  if (!state.mybarOpen) redirect(`/q/${encodeURIComponent(token)}`);
  const locale = (await getLocale()) as Locale;
  return <RoomMybar token={token} locale={locale} state={state} />;
}
