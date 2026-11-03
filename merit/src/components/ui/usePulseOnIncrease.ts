"use client";

import { useEffect, useRef } from "react";
import { pulseOnce } from "./pulseOnce";

/** Değer ARTTIĞINDA (yeni sipariş/çağrı) öğeye tek nabız verir; ilk yüklemede nabız yok. */
export function usePulseOnIncrease<T extends HTMLElement>(value: number) {
  const ref = useRef<T | null>(null);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (prev.current !== null && value > prev.current) pulseOnce(ref.current);
    prev.current = value;
  }, [value]);
  return ref;
}
