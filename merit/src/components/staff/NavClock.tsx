"use client";

import { useEffect, useState } from "react";

const TZ = "Europe/Nicosia";
const part = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleString("tr-TR", { timeZone: TZ, ...options });

/**
 * Hotel time under the side menu: a digital clock and today's date drawn as a calendar leaf. Nothing is drawn
 * on the server (its clock is not the viewer's), so the first paint and hydration agree.
 */
export function NavClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  if (!now) return null;

  const time = part(now, { hour: "2-digit", minute: "2-digit", hour12: false });
  const seconds = part(now, { second: "2-digit" }).padStart(2, "0");
  const full = part(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="staff-nav-clock" data-testid="nav-saat" role="group" aria-label={`Saat ${time}, ${full}`}>
      <div className="staff-nav-digital" aria-hidden="true">
        <span>{time}</span>
        <small>{seconds}</small>
      </div>
      <div className="staff-nav-leaf" aria-hidden="true">
        <span className="staff-nav-leaf-month">
          {part(now, { month: "long" })} {part(now, { year: "numeric" })}
        </span>
        <span className="staff-nav-leaf-day">{part(now, { day: "numeric" })}</span>
        <span className="staff-nav-leaf-weekday">{part(now, { weekday: "long" })}</span>
      </div>
    </div>
  );
}
