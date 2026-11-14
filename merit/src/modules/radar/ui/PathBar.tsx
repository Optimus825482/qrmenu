"use client";

import { Fragment } from "react";

/** One level of the path, general to specific. A level with `onSelect` is a way back up to it. */
export type PathLevel = { key: string; label: string; onSelect?: () => void };

export type PathPlace = {
  /** "Kat" or "Outlet". */
  label: string;
  /** Selected option, "" for all. */
  value: string;
  /** Text of the "all" option; omit when one place must be picked. */
  allLabel?: string;
  options: { id: string; name: string }[];
  onChange(id: string): void;
};

export type PathBarProps = {
  /** Hotel > operation > place > record; the last one is where the user is. */
  levels: PathLevel[];
  /** The place filter of the current operation, when it has places. */
  place?: PathPlace;
  idPrefix: string;
};

/**
 * Where the user is in the radar, general to specific (Otel > Operasyon > Operasyon yeri > Kayıt), with every
 * higher level one click away and the place filter of the current operation beside it.
 */
export function PathBar({ levels, place, idPrefix }: PathBarProps) {
  const last = levels.length - 1;
  return (
    <div className="rd-path">
      <nav aria-label="Konum">
        <ol className="rd-path-levels">
          {levels.map((l, i) => (
            <Fragment key={l.key}>
              <li>
                {i < last && l.onSelect ? (
                  <button type="button" className="rd-link" onClick={l.onSelect}>
                    {l.label}
                  </button>
                ) : (
                  <span aria-current={i === last ? "location" : undefined} className={i === last ? "rd-path-here" : undefined}>
                    {l.label}
                  </span>
                )}
              </li>
              {i < last ? (
                <li aria-hidden="true" className="rd-muted">
                  ›
                </li>
              ) : null}
            </Fragment>
          ))}
        </ol>
      </nav>
      {place ? (
        <div className="rd-path-place">
          <label htmlFor={`${idPrefix}-place`}>{place.label}</label>
          <select
            id={`${idPrefix}-place`}
            className="rd-select"
            value={place.value}
            onChange={(e) => place.onChange(e.target.value)}
          >
            {place.allLabel ? <option value="">{place.allLabel}</option> : null}
            {place.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
