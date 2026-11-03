"use client";

import type { ReactNode } from "react";

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: ReactNode; badge?: number };

export type SegmentedProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
};

/**
 * Material "segmented button" for the sub-sections of one screen: a `tablist` (never a `nav`: the page
 * has exactly one navigation, the shell's bottom bar). Arrow keys move between segments.
 */
export function Segmented<T extends string>({ options, value, onChange, label, className }: SegmentedProps<T>) {
  const move = (from: number, step: number) => {
    const next = options[(from + step + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => document.getElementById(`seg-${label}-${next.value}`)?.focus());
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`inline-flex max-w-full rounded-[var(--radius-m)] border border-border bg-surface p-1 ${className ?? ""}`}
      style={{ gap: "var(--space-1)" }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`seg-${label}-${option.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(index, 1);
              else if (event.key === "ArrowLeft") move(index, -1);
              else return;
              event.preventDefault();
            }}
            style={{ minHeight: "var(--tap-std)", minWidth: "var(--tap-std)" }}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-s)] px-4 text-sm font-semibold ${
              selected ? "bg-accent text-white" : "bg-transparent text-text"
            }`}
          >
            {option.icon}
            {option.label}
            {option.badge ? (
              <span className="rounded-full border border-current px-2 text-[13px] leading-5" aria-label={`${option.badge} adet`}>
                {option.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
