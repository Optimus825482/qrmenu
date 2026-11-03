import type { AccessSummary } from "@/modules/core/server/accessSummary";

/**
 * "Erişimim": who you are, where you work and, per module, the screens you own with what you may do
 * on each. Only owned screens are listed. Pure presentation (server- and client-safe).
 * `self` greets the signed-in user; `preview` describes a role for an administrator.
 */
export function AccessSummaryView({ summary, mode }: { summary: AccessSummary; mode: "self" | "preview" }) {
  const first = summary.user.fullName.trim().split(/\s+/)[0] ?? "";
  const total = summary.modules.reduce((n, m) => n + m.screens.length, 0);
  return (
    <div data-testid="access-summary" data-hash={summary.hash} className="flex flex-col gap-5">
      <header>
        <h2 className="text-xl font-bold text-brand" data-testid="access-greeting">
          {mode === "self" ? (
            <>
              Merhaba {first}. Rolün: <strong>{summary.user.roleName}</strong>, otel: <strong>{summary.hotel.name}</strong>
              {summary.outlet ? <>, outlet: <strong>{summary.outlet.name}</strong></> : null}.
            </>
          ) : (
            <>
              Rol: <strong>{summary.user.roleName}</strong>, otel: <strong>{summary.hotel.name}</strong>.
            </>
          )}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {total === 0
            ? "Bu rol için henüz bir ekran atanmamış. Yöneticine başvur."
            : `Aşağıda ${total} ekranda neler yapabileceğin yazıyor. Açılışta ilk ekranın: ${
                summary.modules.flatMap((m) => m.screens).find((s) => s.code === summary.landing.screenCode)?.name ?? "yok"
              }.`}
        </p>
      </header>
      {summary.modules.map((m) => (
        <section key={m.moduleKey} aria-label={m.label} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{m.label}</h3>
          <ul className="flex flex-col gap-3">
            {m.screens.map((s) => (
              <li
                key={s.code}
                data-testid="access-screen"
                data-code={s.code}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <p className="text-base font-semibold text-text">{s.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.purpose}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text">
                  {s.sentences.map((sentence, i) => (
                    <li key={`${s.actions[i]}`}>{sentence}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
