import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { SCREENS } from "@/modules/core/screens";
import { ReportAccessButton } from "./ReportAccessButton";

export const dynamic = "force-dynamic";

/** "Bu ekran sana atanmadı": where a signed-in user lands when a screen's view permission is missing. */
export default async function YetkisizPage({
  searchParams,
}: {
  searchParams: Promise<{ ekran?: string | string[] }>;
}) {
  const raw = (await searchParams).ekran;
  const code = typeof raw === "string" ? raw : undefined;

  let ctx;
  try {
    ctx = await requireUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      const back = code ? `/yetkisiz?ekran=${encodeURIComponent(code)}` : "/yetkisiz";
      redirect(`/giris?next=${encodeURIComponent(back)}`);
    }
    throw error;
  }

  const screen = SCREENS.find((s) => s.code === code);
  // Unknown code, or the permission was granted meanwhile: nothing to explain.
  if (!screen) redirect("/baslat");
  if (await can(ctx, screen.code, "V", ctx.session.hotelId)) redirect("/baslat");

  const stored = await prisma.appScreen.findUnique({ where: { code: screen.code }, select: { name: true } });
  const name = stored?.name ?? screen.name;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <section
        aria-labelledby="yetkisiz-title"
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8"
      >
        <header>
          <p className="text-sm font-semibold text-muted">{name}</p>
          <h1 id="yetkisiz-title" className="mt-1 text-xl font-bold text-brand">
            Bu ekran sana atanmadı
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {"Bu ekranı görmek için 'Görebilirsin' yetkisi gerekir. Gerekirse yöneticine bildir."}
          </p>
        </header>
        <Link
          href="/baslat"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:opacity-90"
        >
          Ana ekrana dön
        </Link>
        <ReportAccessButton screenCode={screen.code} />
      </section>
    </main>
  );
}
