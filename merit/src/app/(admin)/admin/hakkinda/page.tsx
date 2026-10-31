import "@/shell/theme.css";
import { redirect } from "next/navigation";
import { requireUser, type Ctx } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { XpIcon } from "@/shell/icons";
import pkg from "../../../../../package.json";

// Set by next.config.ts when the build (or dev server) starts.
const BUILD_DATE = process.env.MERIT_BUILD_DATE ?? "—";

const SHELL_ROLE_KINDS = new Set(["SISTEM", "YONETIM"]);

async function currentUser(): Promise<Ctx | null> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") return null;
    throw error;
  }
}

/** Content of the "Hakkında" window: an iframe-kind app (same-origin page inside the shell). */
export default async function AboutPage() {
  const ctx = await currentUser();
  if (!ctx) redirect("/giris?next=%2Fadmin%2Fhakkinda");
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
