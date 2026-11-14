"use client";

import { PageMark, pageOf, type WallPaging } from "../WallPage";
import type { RoleKind } from "@/generated/prisma/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { shortName } from "../../privacy";
import type { RadarState, StateSession } from "../../state";
import type { NameStyle } from "../eventSentence";
import { usePulse } from "../useRadar";

const GROUP_ORDER: { kind: RoleKind; label: string }[] = [
  { kind: "SISTEM", label: "Sistem" },
  { kind: "YONETIM", label: "Yönetim" },
  { kind: "OUTLET", label: "Outlet" },
  { kind: "MUTFAK", label: "Mutfak" },
  { kind: "MINIBAR", label: "Minibar" },
];

const clock = (iso: string) => {
  const t = Date.parse(iso);
  if (!t) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Nicosia",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t));
};

function sessionState(s: StateSession, idleMinutes: number, now: number): {
  label: "Etkin" | "Boşta" | "Süre doluyor";
  tone: "success" | "info" | "warn";
} {
  if (s.status === "UYARI") return { label: "Süre doluyor", tone: "warn" };
  const idleMs = Math.max(1, idleMinutes) * 60_000;
  const seenMs = Date.parse(s.lastSeenAt) || 0;
  if (s.idle === true || (seenMs > 0 && now - seenMs >= idleMs)) {
    return { label: "Boşta", tone: "info" };
  }
  return { label: "Etkin", tone: "success" };
}

function SessionRow({
  session,
  nameStyle,
  idleMinutes,
  outletNames,
  now,
}: {
  session: StateSession;
  nameStyle: NameStyle;
  idleMinutes: number;
  outletNames: ReadonlyMap<string, string>;
  now: number;
}) {
  const ref = usePulse<HTMLTableRowElement>(`session:${session.sessionId}`);
  const st = sessionState(session, idleMinutes, now);
  const displayName = nameStyle === "short" ? shortName(session.name) : session.name || "—";
  const place =
    session.lastPlace ?? (session.outletId ? outletNames.get(session.outletId) : undefined) ?? "—";

  return (
    <tr ref={ref} data-session-id={session.sessionId} data-anchor={`staff:${session.userId}`}>
      <td>{displayName}</td>
      <td>{session.roleCode}</td>
      <td>{place}</td>
      <td>{clock(session.loginAt)}</td>
      <td>{clock(session.lastSeenAt)}</td>
      <td>
        <span className="rd-badge" data-tone={st.tone}>
          {st.label}
        </span>
      </td>
    </tr>
  );
}

export type StaffProps = {
  view: RadarState;
  now: number;
  nameStyle?: NameStyle;
  /** Set on the wall: each group and side list shows one page at a time. */
  paging?: WallPaging;
};

/** Session rows of a group, and rows of a side list, on one wall page. */
const WALL_SESSIONS = 8;
const WALL_SIDE_ROWS = 8;

/** V6 Personel: online sessions grouped by role kind + per-outlet / per-floor staff counts (spec 2.2). */
export function Staff({ view, now, nameStyle = "full", paging }: StaffProps) {
  const sessions = view.layers.staff?.sessions ?? [];
  const outlets = view.layers.order?.outlets ?? [];
  const supervisors = view.layers.minibar?.supervisors ?? [];
  const idleMinutes = view.config.idleMinutes || 10;

  if (!view.layers.staff) return <EmptyState title="Personel katmanı bu kapsamda yok." />;

  const outletPage = pageOf(outlets, WALL_SIDE_ROWS, paging, now);
  const supervisorPage = pageOf(supervisors, WALL_SIDE_ROWS, paging, now);
  const outletNames = new Map<string, string>(outlets.map((o) => [o.outletId, o.name]));

  return (
    <div className="rd-staff-layout">
      <div className="rd-staff-groups">
        {sessions.length === 0 ? (
          <EmptyState title="Aktif oturum yok." />
        ) : (
          GROUP_ORDER.map(({ kind, label }) => {
            const list = sessions.filter((s) => s.roleKind === kind);
            if (list.length === 0) return null;
            const paged = pageOf(list, WALL_SESSIONS, paging, now);
            return (
              <section key={kind} className="rd-panel" aria-label={`${label} oturumları`}>
                <div className="rd-row">
                  <h3>{label}</h3>
                  <span className="rd-badge" data-tone="muted">
                    {list.length} kişi
                  </span>
                </div>
                <div className="overflow-x-auto">
                <table className="rd-table">
                  <caption>{label} çevrimiçi personel listesi</caption>
                  <thead>
                    <tr>
                      <th scope="col">Ad</th>
                      <th scope="col">Rol</th>
                      <th scope="col">Outlet / Kat</th>
                      <th scope="col">Giriş</th>
                      <th scope="col">Son etkinlik</th>
                      <th scope="col">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.items.map((s) => (
                      <SessionRow
                        key={s.sessionId}
                        session={s}
                        nameStyle={nameStyle}
                        idleMinutes={idleMinutes}
                        outletNames={outletNames}
                        now={now}
                      />
                    ))}
                  </tbody>
                </table>
                </div>
                <PageMark paged={paged} total={list.length} unit="kişi" />
              </section>
            );
          })
        )}
      </div>

      <div className="rd-side">
        <section className="rd-panel" aria-label="Outlet personel dağılımı">
          <h3>Outlet başına çevrimiçi</h3>
          {outlets.length === 0 ? (
            <p className="rd-muted rd-small">Outlet yok.</p>
          ) : (
            <ul className="rd-list">
              {outletPage.items.map((o) => {
                const count = sessions.filter((s) => s.outletId === o.outletId).length;
                return (
                  <li key={o.outletId} className="rd-row" data-anchor={`outlet:${o.outletId}`}>
                    <span>{o.name}</span>
                    <span className="rd-badge" data-tone={count > 0 ? "info" : "muted"}>
                      {count} personel
                    </span>
                  </li>
                );
              })}
              <PageMark as="li" paged={outletPage} total={outlets.length} unit="outlet" />
            </ul>
          )}
        </section>

        {supervisors.length > 0 ? (
          <section className="rd-panel" aria-label="Kat sorumlusu dağılımı">
            <h3>Kat sorumluları</h3>
            <ul className="rd-list">
              {supervisorPage.items.map((sup) => {
                const rawName = view.people[sup.userId] ?? sup.name;
                const shown = nameStyle === "short" ? shortName(rawName) : rawName;
                return (
                  <li key={sup.userId} className="rd-row" data-anchor={`staff:${sup.userId}`}>
                    <span>{shown}</span>
                    <span className="rd-muted rd-small">
                      {sup.done}/{sup.total} görev
                    </span>
                  </li>
                );
              })}
              <PageMark as="li" paged={supervisorPage} total={supervisors.length} unit="kişi" />
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
