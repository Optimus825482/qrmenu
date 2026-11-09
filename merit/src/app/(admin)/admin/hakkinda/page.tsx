import "@/shell/theme.css";
import { redirect } from "next/navigation";
import { FONT_STACKS, FONT_WEIGHTS, parseFrameAppearance } from "@/shell/appearance";
import { XpIcon } from "@/shell/icons";
import { APP_VERSION, BUILD_DATE, RELEASE_CODENAME } from "@/lib/version";
import { currentUser, permits } from "../guard";

const SHELL_ROLE_KINDS = new Set(["SISTEM", "YONETIM"]);

/** Content of the "Hakkında" window: an iframe-kind app (same-origin page inside the shell). */
export default async function AboutPage({
  searchParams,
}: {
  searchParams: Promise<{ font?: string | string[]; theme?: string | string[] }>;
}) {
  const ctx = await currentUser();
  if (!ctx) redirect("/giris?next=%2Fadmin%2Fhakkinda");
  // Same screen as the app registry entry (core.hakkinda → CR-SYS); the denial is audited.
  if (!(await permits(ctx, "CR-SYS", "V"))) redirect("/admin");
  if (!SHELL_ROLE_KINDS.has(ctx.user.roleKind)) redirect("/secim");

  // The shell passes its current font and theme (Window.tsx adds ?font=&theme= to the iframe URL).
  const { fontFamily, theme } = parseFrameAppearance(await searchParams);

  return (
    <main
      className="xp-frame-page"
      data-theme={theme}
      style={{ fontFamily: FONT_STACKS[fontFamily], fontWeight: FONT_WEIGHTS[fontFamily] }}
    >
      <div className="xp-about">
        <XpIcon name="bilgi" size={48} />
        <div>
          <h1>F&amp;B Command Center</h1>
          <p style={{ margin: "2px 0 8px 0", color: "#64748b", fontSize: "11px", fontWeight: "600" }}>
            Merit Royal Hotels &amp; Resorts • {RELEASE_CODENAME}
          </p>
          <dl>
            <dt>Sürüm</dt>
            <dd>v{APP_VERSION}</dd>
            <dt>Derleme tarihi</dt>
            <dd>{BUILD_DATE}</dd>
          </dl>
          <p>Bu pencere iframe uygulama sözleşmesinin örneğidir.</p>
        </div>
      </div>
    </main>
  );
}
