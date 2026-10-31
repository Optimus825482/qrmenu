import "@/shell/theme.css";
import { redirect } from "next/navigation";
import { XpIcon } from "@/shell/icons";
import pkg from "../../../../../package.json";
import { currentUser, permits } from "../guard";

// Set by next.config.ts when the build (or dev server) starts.
const BUILD_DATE = process.env.MERIT_BUILD_DATE ?? "—";

const SHELL_ROLE_KINDS = new Set(["SISTEM", "YONETIM"]);

/** Content of the "Hakkında" window: an iframe-kind app (same-origin page inside the shell). */
export default async function AboutPage() {
  const ctx = await currentUser();
  if (!ctx) redirect("/giris?next=%2Fadmin%2Fhakkinda");
  // Same screen as the app registry entry (core.hakkinda → CR-SYS); the denial is audited.
  if (!(await permits(ctx, "CR-SYS", "V"))) redirect("/admin");
  if (!SHELL_ROLE_KINDS.has(ctx.user.roleKind)) redirect("/secim");

  return (
    <main className="xp-frame-page">
      <div className="xp-about">
        <XpIcon name="bilgi" size={48} />
        <div>
          <h1>Merit OS</h1>
          <dl>
            <dt>Sürüm</dt>
            <dd>{pkg.version}</dd>
            <dt>Derleme tarihi</dt>
            <dd>{BUILD_DATE}</dd>
          </dl>
          <p>Bu pencere iframe uygulama sözleşmesinin örneğidir.</p>
        </div>
      </div>
    </main>
  );
}
