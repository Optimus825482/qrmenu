"use client";

import { useId, useMemo, useRef, useState } from "react";

export type SearchSelectOption = { value: string; label: string };

/** Case-insensitive match that treats Turkish letters and their plain forms alike ("seker" finds "Şeker"). */
export function searchKey(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Options whose label contains every word typed, in the given order of the list. */
export function filterOptions(options: readonly SearchSelectOption[], query: string): SearchSelectOption[] {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...options];
  return options.filter((o) => {
    const key = searchKey(o.label);
    return words.every((w) => key.includes(w));
  });
}

type Props = {
  options: readonly SearchSelectOption[];
  value: string;
  onChange(value: string): void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
};

/**
 * A select that is typed into: tapping it opens the on-screen keyboard and the list narrows as the user
 * types. A long product list on a tablet is found by name instead of by scrolling.
 */
export function SearchSelect({ options, value, onChange, placeholder, ariaLabel, className = "" }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => filterOptions(options, query), [options, query]);

  const pick = (option: SearchSelectOption) => {
    onChange(option.value);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : (selected?.label ?? "")}
        onFocus={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && shown[active]) pick(shown[active]);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            inputRef.current?.blur();
          }
        }}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-warn/40"
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-xl"
        >
          {shown.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">Eşleşen ürün yok</li>
          ) : (
            shown.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                // The press must not blur the input first, or the list closes before the pick lands.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
                className={`cursor-pointer px-3 py-2.5 text-sm text-text ${
                  index === active ? "bg-warn/15" : ""
                } ${option.value === value ? "font-bold" : ""}`}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
