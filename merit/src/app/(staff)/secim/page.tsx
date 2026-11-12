import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listTargets } from "@/modules/core/server/targets";
import { TargetList, type TargetCard } from "./TargetList";

export default async function TargetPickerPage() {
  const session = await getSession();
  if (session.userId && session.sessionId) {
    // Selecting a target rewrites the cookie, and Next re-renders this route with the new one
    // while the client is still navigating to the chosen screen: do not bounce to /giris then.
    return (
      <section className="flex flex-col gap-5" aria-labelledby="open-title">
        <header>
          <h1 id="open-title" className="text-xl font-bold text-brand">
            Oturumunuz açık
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Başka bir hesapla girmek için önce oturumu kapatın.
          </p>
        </header>
        <a href="/baslat" className="rounded-xl bg-accent px-4 py-3 text-center text-sm font-bold text-white">
          Ana ekrana dön
        </a>
        <LogoutButton />
      </section>
    );
  }
  if (!session.userId || !session.pendingTargets) redirect("/giris");

  const targets = await listTargets(session.userId);

  if (targets.length === 0) {
    return (
      <section className="flex flex-col gap-5" aria-labelledby="empty-title">
        <header>
          <h1 id="empty-title" className="text-xl font-bold text-brand">
            Atama yok
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Hesabınız henüz bir ekibe eklenmemiş. Yöneticinizden, Kullanıcı Yönetimi &gt; Ekip
            Yönetimi ekranından sizi çalışacağınız outlet, oda servisi veya minibar ekibine
            eklemesini isteyin.
          </p>
        </header>
        <LogoutButton />
      </section>
    );
  }

  const roles = await prisma.role.findMany({
    where: { id: { in: [...new Set(targets.map((t) => t.roleId))] } },
    select: { id: true, name: true },
  });
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  // `index` is the position in listTargets(): selectTargetAction picks by it.
  const cards: TargetCard[] = targets.map((t, index) => ({
    index,
    hotelName: t.hotelName,
    hotelCode: t.hotelCode,
    label: t.label,
    roleName: roleName.get(t.roleId) ?? "",
  }));

  return (
    <section className="flex flex-col gap-5" aria-labelledby="picker-title">
      <header>
        <h1 id="picker-title" className="text-xl font-bold text-brand">
          Nerede çalışacaksınız?
        </h1>
        <p className="mt-1 text-sm text-muted">Oturumu açmak için bir çalışma alanı seçin.</p>
      </header>
      <TargetList targets={cards} />
      <LogoutButton />
    </section>
  );
}
