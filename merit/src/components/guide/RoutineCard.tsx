"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { ROUTINE_POLL_MS, ROUTINE_REFRESH_EVENTS } from "@/modules/core/routineEvents";
import { toggleChecklistAction } from "@/modules/core/server/guideActions";
import { getRoutinesAction } from "@/modules/core/server/routineActions";
import type { RoutineItemStatus, RoutineStatus } from "@/modules/core/server/routines";
import { useSse } from "@/shell/useSse";

type Props = {
  /** Server-rendered first state; without it the card loads its own routines on mount. */
  routines?: RoutineStatus[];
};

/**
 * Compact daily checklist of the signed-in role. Automatic items are read-only ("otomatik") and
 * follow live data; manual items are ticked by the user (optimistic, rolled back on failure).
 * Reloads on the realtime events that can flip an automatic item, and every minute as a safety net.
 */
export function RoutineCard({ routines: initial }: Props) {
  const [routines, setRoutines] = useState<RoutineStatus[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  /** Manual ticks the user just made, ahead of the server answer: `${routineId}:${itemId}` -> done. */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const inFlight = useRef(0);

  const reload = useCallback(async () => {
    const result = await getRoutinesAction();
    if (!result.ok || inFlight.current > 0) return;
    setRoutines(result.data);
  }, []);

  useEffect(() => {
    if (initial) return;
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [initial, reload]);

  useEffect(() => {
    const timer = setInterval(() => void reload(), ROUTINE_POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const eventTypes = useMemo(() => {
    const kinds = new Set<keyof typeof ROUTINE_REFRESH_EVENTS>();
    for (const status of routines ?? []) for (const item of status.items) if (item.kind) kinds.add(item.kind);
    return [...new Set([...kinds].flatMap((kind) => ROUTINE_REFRESH_EVENTS[kind]))];
  }, [routines]);
  useSse(() => void reload(), eventTypes);

  if (!routines || routines.length === 0) return null;

  const toggle = async (status: RoutineStatus, item: RoutineItemStatus, done: boolean) => {
    const key = `${status.routine.id}:${item.id}`;
    setError(null);
    setOptimistic((current) => ({ ...current, [key]: done }));
    inFlight.current += 1;
    try {
      const result = await toggleChecklistAction(status.day, item.id, done);
      if (!result.ok) throw new Error(result.error.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşaret kaydedilemedi");
    } finally {
      inFlight.current -= 1;
      setOptimistic((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await reload();
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="routine-cards">
      {routines.map((status) => {
        const doneOf = (item: RoutineItemStatus) => optimistic[`${status.routine.id}:${item.id}`] ?? item.done;
        const doneCount = status.items.filter(doneOf).length;
        return (
          <details
            key={status.routine.id}
            open={status.expanded}
            data-testid="routine-card"
            data-routine={status.routine.id}
            className="rounded-xl border border-border bg-surface text-text"
          >
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-3 px-4"
              style={{ minHeight: "var(--tap-std, 48px)" }}
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                <Icon name="clipboard" size={20} />
                {status.routine.title}
              </span>
              <span className="text-sm font-semibold text-muted tabular-nums" data-testid="routine-progress">
                {doneCount}/{status.items.length}
              </span>
            </summary>
            <ul className="flex flex-col border-t border-border">
              {status.items.map((item) => {
                const done = doneOf(item);
                return (
                  <li
                    key={item.id}
                    data-testid="routine-item"
                    data-item={item.id}
                    data-done={done ? "true" : "false"}
                    data-auto={item.auto ? "true" : "false"}
                    className="flex items-center gap-1 border-b border-border last:border-b-0"
                  >
                    {item.auto ? (
                      <span
                        role="img"
                        aria-label={done ? "Otomatik: tamam" : "Otomatik: bekliyor"}
                        className={`flex size-11 shrink-0 items-center justify-center ${done ? "text-success" : "text-muted"}`}
                      >
                        <Icon name={done ? "check-circle" : "clock"} size={22} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        aria-label={item.label}
                        onClick={() => void toggle(status, item, !done)}
                        className={`flex size-11 shrink-0 items-center justify-center ${done ? "text-success" : "text-muted"}`}
                      >
                        <Icon name={done ? "check-circle" : "circle"} size={22} />
                      </button>
                    )}
                    <Link
                      href={item.href}
                      className={`flex min-h-11 flex-1 items-center py-2 text-sm hover:underline ${done ? "text-muted line-through" : "text-text"}`}
                    >
                      {item.label}
                    </Link>
                    {item.auto ? (
                      <span className="shrink-0 pr-3 text-sm font-semibold text-muted">otomatik</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {error ? (
              <p role="alert" className="px-4 pb-3 text-sm font-semibold text-danger">
                {error}
              </p>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}
