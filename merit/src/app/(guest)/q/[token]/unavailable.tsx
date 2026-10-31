import { getTranslations } from "next-intl/server";
import type { NoneReason } from "@/modules/menu/server/guestToken";

/**
 * The page a guest sees when the QR code cannot be served (unknown token, inactive table / outlet / hotel,
 * menu module off, rate limited, or a lookup failure). No theme, no outlet data.
 */
export default async function Unavailable({ reason }: { reason: NoneReason }) {
  const t = await getTranslations("guest");
  return (
    <main className="g-unavailable" data-reason={reason}>
      <h1>{t("unavailable.title")}</h1>
      <p>{t(`unavailable.${reason}`)}</p>
      {(reason === "HATA" || reason === "RATE_LIMITED") && (
        // A plain link to the same URL: reloading re-runs the lookup.
        <a className="g-button" href="">
          {t("common.retry")}
        </a>
      )}
    </main>
  );
}
