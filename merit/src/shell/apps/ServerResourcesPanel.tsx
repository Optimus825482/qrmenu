"use client";

import { useEffect, useRef, useState } from "react";
import { getServerResourcesAction } from "@/modules/core/server/diagnostic/actions";
import type { DiskVolume, ServerResources } from "@/modules/core/server/diagnostic/serverResources";

const POLL_MS = 10_000;
const HISTORY = 60; // 10 minutes at one sample per 10 s

const OK = "#16a34a";
const WARN = "#d97706";
const BAD = "#dc2626";
const TRACK = "#e5e7eb";

/** Colour of a value against its two thresholds (as fractions of the scale). */
const tone = (ratio: number, warn: number, bad: number) => (ratio >= bad ? BAD : ratio >= warn ? WARN : OK);

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const gb = bytes / 1024 ** 3;
  if (gb >= 100) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d} gün ${h} sa` : h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

// --- gauge geometry: a 240° arc, opening at the bottom ------------------------------------------

const START = 150; // degrees, clockwise from 3 o'clock
const SWEEP = 240;

function point(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** SVG path of the arc between two positions of the scale (0 … 1). */
function arc(r: number, from: number, to: number): string {
  const a = START + SWEEP * from;
  const b = START + SWEEP * to;
  const [x1, y1] = point(60, 58, r, a);
  const [x2, y2] = point(60, 58, r, b);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function Gauge({
  label,
  value,
  max = 100,
  unit = "%",
  warn = 0.7,
  bad = 0.9,
  detail,
  history,
}: {
  label: string;
  /** null = not measured yet. */
  value: number | null;
  max?: number;
  unit?: string;
  warn?: number;
  bad?: number;
  detail?: string;
  history?: number[];
}) {
  const ratio = value === null ? 0 : Math.max(0, Math.min(1, value / max));
  const color = tone(ratio, warn, bad);
  const shown = value === null ? "—" : value >= 100 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
  return (
    <figure
      className="m-0 flex flex-col items-center rounded-lg border border-border bg-white px-2 pb-2 pt-1.5 shadow-xs"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? "ölçülüyor" : `${shown} ${unit}`}
    >
      <figcaption className="self-start text-xs font-semibold uppercase text-muted">{label}</figcaption>
      <svg viewBox="0 0 120 92" className="w-full max-w-[170px]" aria-hidden="true">
        {/* threshold ring: where green ends, where red starts */}
        <path d={arc(50, 0, warn)} fill="none" stroke={OK} strokeWidth="2.5" opacity="0.55" />
        <path d={arc(50, warn, bad)} fill="none" stroke={WARN} strokeWidth="2.5" opacity="0.55" />
        <path d={arc(50, bad, 1)} fill="none" stroke={BAD} strokeWidth="2.5" opacity="0.55" />
        <path d={arc(41, 0, 1)} fill="none" stroke={TRACK} strokeWidth="11" strokeLinecap="round" />
        {ratio > 0.004 ? (
          <path
            d={arc(41, 0, ratio)}
            fill="none"
            stroke={color}
            strokeWidth="11"
            strokeLinecap="round"
            style={{ transition: "d 500ms ease, stroke 300ms ease" }}
          />
        ) : null}
        <text x="60" y="62" textAnchor="middle" fontSize="23" fontWeight="800" fill={value === null ? "#9ca3af" : color}>
          {shown}
        </text>
        <text x="60" y="76" textAnchor="middle" fontSize="9" fontWeight="600" fill="#6b7280">
          {unit}
        </text>
      </svg>
      {history && history.length > 1 ? <Sparkline values={history} max={max} color={color} /> : <div className="h-[22px]" />}
      <span className="mt-0.5 min-h-[1rem] text-center text-xs text-muted tabular-nums">{detail ?? ""}</span>
    </figure>
  );
}

/** Last ten minutes as a filled line; no axes, the gauge above carries the number. */
function Sparkline({ values, max, color }: { values: number[]; max: number; color: string }) {
  const w = 150;
  const h = 22;
  const step = w / (HISTORY - 1);
  const offset = w - (values.length - 1) * step;
  const pts = values.map((v, i) => `${(offset + i * step).toFixed(1)},${(h - 1 - (Math.min(v, max) / max) * (h - 3)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[22px] w-full max-w-[170px]" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`${offset.toFixed(1)},${h} ${pts.join(" ")} ${w},${h}`} fill={color} opacity="0.14" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

const CELLS = 40;

/** Disk as a segmented bar: every cell is 2.5 % of the volume, coloured by where it sits on the scale. */
function DiskBar({ disk }: { disk: DiskVolume }) {
  const filled = Math.round((disk.usedPct / 100) * CELLS);
  const state = tone(disk.usedPct / 100, 0.75, 0.9);
  return (
    <div
      className="rounded-lg border border-border bg-white p-3 shadow-xs"
      role="meter"
      aria-label={`${disk.label} doluluğu`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={disk.usedPct}
      aria-valuetext={`yüzde ${disk.usedPct} dolu, ${formatBytes(disk.freeBytes)} boş`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-xs font-semibold uppercase text-muted">
          {disk.label} <span className="font-normal normal-case">· {disk.path}</span>
        </span>
        <span className="text-xs text-muted tabular-nums">
          {formatBytes(disk.usedBytes)} dolu · <strong className="text-text">{formatBytes(disk.freeBytes)} boş</strong> · toplam{" "}
          {formatBytes(disk.totalBytes)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex h-7 flex-1 gap-[2px]" aria-hidden="true">
          {Array.from({ length: CELLS }, (_, i) => {
            const cell = tone((i + 0.5) / CELLS, 0.75, 0.9);
            return (
              <span
                key={i}
                className="flex-1 rounded-[2px]"
                style={{ backgroundColor: cell, opacity: i < filled ? 1 : 0.13, transition: "opacity 400ms ease" }}
              />
            );
          })}
        </div>
        <span className="w-[4.5rem] text-right text-2xl font-extrabold tabular-nums" style={{ color: state }}>
          %{Math.round(disk.usedPct)}
        </span>
      </div>
      <div className="mt-1 flex justify-between pr-[5.25rem] text-[10px] text-muted tabular-nums" aria-hidden="true">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span style={{ color: WARN }}>75</span>
        <span style={{ color: BAD }}>90 · 100</span>
      </div>
      {state !== OK ? (
        <p className="mt-1.5 text-xs font-semibold" style={{ color: state }}>
          {state === BAD
            ? "Disk dolmak üzere: eski Docker imajlarını ve derleme önbelleğini temizleyin."
            : "Disk dolmaya başladı: yakında temizlik gerekecek."}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Sunucu Kaynakları: gauges for CPU, memory, the app process and the database, and the disks as
 * segmented bars. Polls only while this tab is on screen and the browser tab is visible.
 */
export function ServerResourcesPanel() {
  const [data, setData] = useState<ServerResources | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const res = await getServerResourcesAction();
        if (!live) return;
        if (!res.ok) return setError(res.error.message);
        setError(null);
        setData(res.data);
        const push = (v: number) => (prev: number[]) => [...prev, v].slice(-HISTORY);
        if (res.data.cpuPct !== null) setCpuHistory(push(res.data.cpuPct));
        setMemHistory(push(res.data.memory.usedPct));
      } catch {
        if (live) setError("Sunucu kaynakları okunamadı.");
      } finally {
        busy.current = false;
      }
    };
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), POLL_MS);
    const onVisible = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (error && !data) {
    return (
      <p role="alert" className="text-xs font-semibold text-danger">
        {error}
      </p>
    );
  }
  if (!data) return <p className="text-xs text-muted">Sunucu kaynakları okunuyor…</p>;

  const { host, memory, process: proc, database } = data;
  const connPct = database.connections !== null && database.maxConnections ? (database.connections / database.maxConnections) * 100 : null;
  const biggest = Math.max(1, ...database.sizes.map((s) => s.bytes));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        {host.cores} çekirdek · sunucu açık kalma süresi {formatUptime(host.uptimeSeconds)}
        {host.loadAvg ? ` · yük ortalaması ${host.loadAvg.map((n) => n.toFixed(2)).join(" / ")} (1 / 5 / 15 dk)` : ""} · 10 saniyede
        bir yenilenir
        {error ? <strong className="text-danger"> · son okuma başarısız</strong> : null}
      </p>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <Gauge
          label="İşlemci"
          value={data.cpuPct}
          detail={data.cpuPct === null ? "ilk ölçüm bekleniyor" : `${host.cores} çekirdeğin ortalaması`}
          history={cpuHistory}
        />
        <Gauge
          label="Sunucu belleği"
          value={memory.usedPct}
          warn={0.8}
          bad={0.92}
          detail={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`}
          history={memHistory}
        />
        <Gauge
          label="Uygulama belleği"
          value={proc.heapPct}
          warn={0.7}
          bad={0.85}
          detail={`heap ${formatBytes(proc.heapUsedBytes)} / ${formatBytes(proc.heapLimitBytes)} · toplam ${formatBytes(proc.rssBytes)}`}
        />
        <Gauge
          label="Yanıt gecikmesi"
          value={proc.eventLoopLagMs}
          max={250}
          unit="ms"
          warn={0.2}
          bad={0.8}
          detail="uygulamanın iş kuyruğu gecikmesi"
        />
        <Gauge
          label="Veritabanı bağlantıları"
          value={connPct === null ? null : Math.round(connPct * 10) / 10}
          detail={connPct === null ? "okunamadı" : `${database.connections} / ${database.maxConnections} bağlantı`}
        />
      </div>

      <section aria-label="Disk doluluğu" className="flex flex-col gap-2.5">
        <h3 className="m-0 text-xs font-bold uppercase tracking-wider text-text">Disk doluluğu</h3>
        {data.disks.length === 0 ? <p className="text-xs text-muted">Disk bilgisi okunamadı.</p> : null}
        {data.disks.map((disk) => (
          <DiskBar key={disk.path} disk={disk} />
        ))}
      </section>

      {database.sizes.length > 0 ? (
        <section aria-label="Veritabanı boyutları" className="rounded-lg border border-border bg-white p-3 shadow-xs">
          <h3 className="m-0 text-xs font-semibold uppercase text-muted">Veritabanlarının diskte kapladığı alan</h3>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
            {database.sizes.map((db) => (
              <li key={db.name} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2 text-xs">
                <span className="truncate font-semibold text-text">{db.name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-[#eef1f5]">
                  <span className="block h-full rounded-full bg-[#3b82f6]" style={{ width: `${Math.max(2, (db.bytes / biggest) * 100)}%` }} />
                </span>
                <span className="text-right tabular-nums text-muted">{formatBytes(db.bytes)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
