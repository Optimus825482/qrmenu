"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { Button } from "@/components/ui/Button";
import { BackLink } from "@/components/staff/BackLink";
import { dropBackEntry, historyBack, pushBackEntry } from "@/shell/backStack";
import { askLeave, useLeaveGuard, type LeaveGuard } from "@/shell/useLeaveGuard";

/*
 * Merkez depo teslimi (minibar operasyonları sistem sorumlusu): what was taken from the central warehouse is
 * entered by hand or read from a photo of the document, corrected in a preview, split between the hotels and
 * saved. Saving puts every share straight into that hotel's stock (otel deposu).
 */

type Hotel = { id: string; name: string; code: string };
type Product = { id: string; name: string; groupName: string; unit: string };
type Receipt = {
  id: string;
  code: string;
  documentNo: string | null;
  receivedOn: string;
  source: string;
  hasImage: boolean;
  note: string | null;
  createdBy: string;
  createdAt: string;
  totalQty: number;
  items: { productName: string; qty: number; expiryDate: string | null; allocations: { hotelName: string; qty: number }[] }[];
};
type Line = {
  key: number;
  productId: string;
  qty: number;
  expiryDate: string;
  /** Text of the document line this row was read from (OCR only). */
  raw?: string;
  /** hotelId -> quantity */
  shares: Record<string, number>;
};
type Step = 1 | 2 | 3;

const FIELD =
  "min-h-[var(--tap-std)] w-full rounded-[var(--radius-m)] border border-border bg-surface px-3 text-base text-text placeholder:text-muted";
const CARD = "rounded-[var(--radius-l)] border border-border bg-surface";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const trDate = (iso: string) => iso.split("-").reverse().join(".");
const sharesTotal = (line: Line) => Object.values(line.shares).reduce((sum, n) => sum + (n || 0), 0);

let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, productId: "", qty: 0, expiryDate: "", shares: {} });

export default function TedarikPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [documentNo, setDocumentNo] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [imageToken, setImageToken] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openReceipt, setOpenReceipt] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** History entries of the wizard steps 2 and 3 (decision D5): the phone's back goes one step back. */
  const stepEntries = useRef<{ 2: number | null; 3: number | null }>({ 2: null, 3: null });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/minibar/receipts");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Tedarik bilgileri alınamadı.");
      setHotels(data.hotels || []);
      setProducts(data.products || []);
      setReceipts(data.receipts || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  /** Moves forward to step 2 or 3; its own history entry brings the user back to the step before. */
  const enterStep = (to: 2 | 3) => {
    if (stepEntries.current[to] === null) {
      stepEntries.current[to] = pushBackEntry(() => {
        stepEntries.current[to] = null;
        setStep(to === 3 ? 2 : 1);
      });
    }
    setStep(to);
  };
  /** Takes the step entries off the history, the top-most first (a save, leaving by the page's "Geri"). */
  const dropSteps = useCallback(() => {
    const { 2: second, 3: third } = stepEntries.current;
    stepEntries.current = { 2: null, 3: null };
    const pending = [third, second].filter((id): id is number => id !== null).map((id) => dropBackEntry(id));
    return Promise.all(pending).then(() => undefined);
  }, []);
  useEffect(() => () => void dropSteps(), [dropSteps]);
  /** The in-page "Geri" of a step: the same as the phone's back (over the step's own entry). */
  const stepBack = () => {
    if (step === 1) return;
    if (stepEntries.current[step] !== null) void historyBack();
    else setStep(step === 3 ? 2 : 1);
  };

  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const patch = (key: number, change: Partial<Line>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const filled = lines.filter((l) => l.productId || l.qty > 0);

  /** Why the product list cannot go on to the distribution step (null = it can). */
  const listProblem = (() => {
    if (filled.length === 0) return "En az bir ürün girin.";
    const seen = new Set<string>();
    for (const [i, l] of filled.entries()) {
      if (!l.productId) return `${i + 1}. satırda ürün seçilmedi.`;
      if (!Number.isInteger(l.qty) || l.qty < 1) return `${i + 1}. satırda miktar girilmedi.`;
      if (l.expiryDate && l.expiryDate < receivedOn) return `${i + 1}. satırda SKT tedarik tarihinden önce.`;
      const id = `${l.productId}|${l.expiryDate}`;
      if (seen.has(id)) return `${productName.get(l.productId) ?? "Ürün"} aynı SKT ile iki satırda; satırları birleştirin.`;
      seen.add(id);
    }
    if (!receivedOn || receivedOn > today()) return "Tedarik tarihi bugün ya da daha önce olmalıdır.";
    return null;
  })();
  const shareProblem = (() => {
    for (const [i, l] of filled.entries()) {
      const given = sharesTotal(l);
      if (given !== l.qty) return `${i + 1}. satır (${productName.get(l.productId) ?? ""}): ${l.qty} adedin ${given} adedi dağıtıldı.`;
    }
    return null;
  })();

  const goToShares = () => {
    // One hotel in scope: everything goes there. Otherwise keep what was typed and trim what no longer fits.
    setLines((all) =>
      all
        .filter((l) => l.productId || l.qty > 0)
        .map((l) => (hotels.length === 1 ? { ...l, shares: { [hotels[0].id]: l.qty } } : sharesTotal(l) > l.qty ? { ...l, shares: {} } : l)),
    );
    enterStep(2);
  };

  const splitEvenly = () =>
    setLines((all) =>
      all.map((l) => {
        const base = Math.floor(l.qty / hotels.length);
        const extra = l.qty - base * hotels.length;
        return { ...l, shares: Object.fromEntries(hotels.map((h, i) => [h.id, base + (i < extra ? 1 : 0)])) };
      }),
    );
  const allTo = (hotelId: string) => setLines((all) => all.map((l) => ({ ...l, shares: { [hotelId]: l.qty } })));

  const readImage = async (file: File) => {
    try {
      setReading(true);
      setError(null);
      setNotice(null);
      const form = new FormData();
      form.set("image", file);
      const res = await fetch("/api/minibar/receipts/ocr", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Görsel okunamadı.");
      const read: Line[] = (data.lines || []).map(
        (l: { raw: string; productId: string | null; qty: number | null; expiryDate: string | null }): Line => ({
          key: nextKey++,
          productId: l.productId ?? "",
          qty: l.qty ?? 0,
          expiryDate: l.expiryDate ?? "",
          raw: l.raw,
          shares: {},
        }),
      );
      setImageToken(data.imageToken ?? null);
      setOcrText(data.text ?? "");
      if (read.length === 0) {
        setNotice("Görselde ürün satırı bulunamadı. Okunan metin aşağıda; ürünleri elle girebilirsiniz.");
      } else {
        setLines(read);
        const unmatched = read.filter((l) => !l.productId).length;
        setNotice(
          `Görselden ${read.length} satır okundu${unmatched ? `; ${unmatched} satırda ürün tanınmadı` : ""}. Lütfen her satırı evrakla karşılaştırıp düzeltin.`,
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Görsel okunamadı.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const reset = () => {
    setStep(1);
    setDocumentNo("");
    setReceivedOn(today());
    setNote("");
    setLines([emptyLine()]);
    setImageToken(null);
    setOcrText(null);
  };

  const dirty = step > 1 || filled.length > 0 || documentNo.trim() !== "" || note.trim() !== "" || imageToken !== null;
  const guard = useLeaveGuard(dirty);
  // The page's "Geri" from inside the wizard: one question, then the step entries and the guard come off the history.
  const wizardGuard: LeaveGuard = {
    leave: async () => {
      if (dirty && !(await askLeave())) return false;
      await dropSteps();
      await guard.release();
      return true;
    },
    release: async () => {
      await dropSteps();
      await guard.release();
    },
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/minibar/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentNo: documentNo.trim() || undefined,
          receivedOn,
          note: note.trim() || undefined,
          imageToken: imageToken ?? undefined,
          items: filled.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            expiryDate: l.expiryDate || undefined,
            allocations: Object.entries(l.shares)
              .filter(([, n]) => n > 0)
              .map(([hotelId, n]) => ({ hotelId, qty: n })),
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Tedarik kaydedilemedi.");
      setNotice(`Tedarik ${data.code} kaydedildi; ürünler otel depolarına eklendi.`);
      void dropSteps();
      reset();
      void load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Tedarik kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const perHotel = hotels
    .map((h) => ({ hotel: h, total: filled.reduce((sum, l) => sum + (l.shares[h.id] || 0), 0), kinds: filled.filter((l) => (l.shares[h.id] || 0) > 0).length }))
    .filter((x) => x.total > 0);

  return (
    <div className="flex flex-col gap-4 text-text">
      <div className="flex flex-wrap items-center gap-2">
        <BackLink guard={wizardGuard} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Icon name="box" size={24} />
            Merkez depo tedarik
          </h1>
          <p className="text-sm text-muted">Merkez depodan alınan ürünler doğrudan otel depolarına dağıtılır</p>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-[var(--radius-l)] border border-danger bg-[var(--danger-bg)] p-4 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-[var(--radius-l)] border border-success bg-[var(--success-bg)] p-4 text-sm text-text">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-muted">Yükleniyor...</p>
      ) : hotels.length === 0 ? (
        <p className={`${CARD} p-6 text-center text-muted`}>
          Bu ekranı yalnızca minibar operasyonları sistem sorumlusu kullanabilir.
        </p>
      ) : (
        <>
          <ol className="flex flex-wrap gap-2 text-sm font-semibold" aria-label="Adımlar">
            {(["Ürünler", "Otellere dağıtım", "Önizleme ve kayıt"] as const).map((label, i) => (
              <li
                key={label}
                aria-current={step === i + 1 ? "step" : undefined}
                className={`rounded-full border px-3 py-1 ${step === i + 1 ? "border-transparent bg-accent text-white" : "border-border bg-surface text-muted"}`}
              >
                {i + 1}. {label}
              </li>
            ))}
          </ol>

          {step === 1 ? (
            <section className={`${CARD} space-y-4 p-4`}>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-semibold">
                  Evrak / irsaliye no
                  <input className={`${FIELD} mt-1`} value={documentNo} maxLength={60} onChange={(e) => setDocumentNo(e.target.value)} placeholder="İsteğe bağlı" />
                </label>
                <label className="block text-sm font-semibold">
                  Tedarik tarihi
                  <input type="date" className={`${FIELD} mt-1`} value={receivedOn} max={today()} onChange={(e) => setReceivedOn(e.target.value)} />
                </label>
                <label className="block text-sm font-semibold">
                  Not
                  <input className={`${FIELD} mt-1`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="İsteğe bağlı" />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-m)] border border-border bg-[var(--muted-bg)] p-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="sr-only"
                  aria-label="Evrak görseli seç"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void readImage(file);
                  }}
                />
                <Button icon={<Icon name="plus" size={20} />} disabled={reading} onClick={() => fileRef.current?.click()}>
                  {reading ? "Görsel okunuyor..." : imageToken ? "Başka görsel yükle" : "Evrak görseli yükle"}
                </Button>
                <p className="min-w-0 flex-1 text-sm text-muted">
                  {reading
                    ? "Görsel bu sunucuda okunuyor; bir dakikaya kadar sürebilir."
                    : "Evrağın fotoğrafını (JPG / PNG) yükleyin: ürünler ve miktarlar aşağıya ön izleme olarak gelir. Ya da satırları elle girin."}
                </p>
              </div>

              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tedarik edilen ürünler">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-border bg-bg font-semibold text-muted">
                      <th scope="col" className="px-3 py-2">Ürün</th>
                      <th scope="col" className="w-32 px-3 py-2">Miktar (adet)</th>
                      <th scope="col" className="w-44 px-3 py-2">SKT</th>
                      <th scope="col" className="w-16 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={line.key} className={line.raw && !line.productId ? "bg-[var(--warn-bg)]" : `${i % 2 === 0 ? "bg-surface" : "bg-bg"} hover:bg-accent/10`}>
                        <td className="px-3 py-2">
                          <select
                            aria-label={`${i + 1}. satır ürün`}
                            className={FIELD}
                            value={line.productId}
                            onChange={(e) => patch(line.key, { productId: e.target.value })}
                          >
                            <option value="">Ürün seçin…</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.groupName})
                              </option>
                            ))}
                          </select>
                          {line.raw ? <p className="mt-1 truncate text-[13px] text-muted">Evrakta: “{line.raw}”</p> : null}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="number"
                            min={1}
                            max={100000}
                            aria-label={`${i + 1}. satır miktar`}
                            className={`${FIELD} font-bold`}
                            value={line.qty || ""}
                            onChange={(e) => patch(line.key, { qty: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="date"
                            aria-label={`${i + 1}. satır son kullanma tarihi`}
                            className={FIELD}
                            value={line.expiryDate}
                            min={receivedOn}
                            onChange={(e) => patch(line.key, { expiryDate: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Button
                            aria-label={`${i + 1}. satırı sil`}
                            icon={<Icon name="close" size={18} />}
                            onClick={() => setLines((all) => (all.length === 1 ? [emptyLine()] : all.filter((l) => l.key !== line.key)))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button icon={<Icon name="plus" size={20} />} onClick={() => setLines((all) => [...all, emptyLine()])}>
                  Satır ekle
                </Button>
                <div className="flex flex-wrap items-center gap-3">
                  {listProblem ? <span className="text-sm text-muted">{listProblem}</span> : null}
                  <Button variant="primary" disabled={!!listProblem} onClick={goToShares}>
                    Otellere dağıtıma geç
                  </Button>
                </div>
              </div>
              {ocrText !== null ? (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-muted">Görselden okunan ham metin</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--radius-m)] border border-border bg-bg p-3 text-[13px] text-text">
                    {ocrText || "(metin okunamadı)"}
                  </pre>
                </details>
              ) : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section className={`${CARD} space-y-4 p-4`}>
              <p className="text-sm text-muted">
                Her ürünün hangi otele kaç adet gideceğini yazın. Alınan miktarın tamamı dağıtılmalıdır; merkezde ayrı bir depo tutulmaz.
              </p>
              {hotels.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={splitEvenly}>Eşit böl</Button>
                  {hotels.map((h) => (
                    <Button key={h.id} onClick={() => allTo(h.id)}>
                      Tümü → {h.name}
                    </Button>
                  ))}
                </div>
              ) : null}
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Otellere dağıtım">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-border bg-bg font-semibold text-muted">
                      <th scope="col" className="px-3 py-2">Ürün</th>
                      <th scope="col" className="px-3 py-2 text-center">Alınan</th>
                      {hotels.map((h) => (
                        <th key={h.id} scope="col" className="px-3 py-2 text-center">
                          {h.name}
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 text-center">Kalan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, lineIdx) => {
                      const left = line.qty - sharesTotal(line);
                      return (
                        <tr key={line.key} className={`${lineIdx % 2 === 0 ? "bg-surface" : "bg-bg"} hover:bg-accent/10`}>
                          <td className="px-3 py-2 font-bold">
                            {productName.get(line.productId)}
                            {line.expiryDate ? <span className="ml-2 font-normal text-muted">SKT {trDate(line.expiryDate)}</span> : null}
                          </td>
                          <td className="px-3 py-2 text-center font-bold">{line.qty}</td>
                          {hotels.map((h) => (
                            <td key={h.id} className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={line.qty}
                                aria-label={`${productName.get(line.productId)} · ${h.name}`}
                                className={`${FIELD} min-w-24 text-center font-bold`}
                                value={line.shares[h.id] || ""}
                                onChange={(e) =>
                                  patch(line.key, { shares: { ...line.shares, [h.id]: Math.max(0, parseInt(e.target.value, 10) || 0) } })
                                }
                              />
                            </td>
                          ))}
                          <td className={`px-3 py-2 text-center font-bold ${left === 0 ? "text-success" : "text-danger"}`}>{left}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button onClick={stepBack}>Geri</Button>
                <div className="flex flex-wrap items-center gap-3">
                  {shareProblem ? <span className="text-sm text-muted">{shareProblem}</span> : null}
                  <Button variant="primary" disabled={!!shareProblem} onClick={() => enterStep(3)}>
                    Önizlemeye geç
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className={`${CARD} space-y-4 p-4`}>
              <p className="text-sm">
                <strong>{trDate(receivedOn)}</strong> tarihli tedarik{documentNo.trim() ? ` (evrak ${documentNo.trim()})` : ""}:{" "}
                <strong>{filled.length} satır</strong>, toplam <strong>{filled.reduce((sum, l) => sum + l.qty, 0)} adet</strong>. Kaydedince aşağıdaki
                miktarlar otel depolarına eklenir.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {perHotel.map(({ hotel, total, kinds }) => (
                  <div key={hotel.id} className="rounded-[var(--radius-m)] border border-border bg-[var(--muted-bg)] p-3">
                    <p className="font-bold">{hotel.name}</p>
                    <p className="text-sm text-muted">
                      {kinds} ürün · {total} adet
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {filled
                        .filter((l) => (l.shares[hotel.id] || 0) > 0)
                        .map((l) => (
                          <li key={l.key} className="flex justify-between gap-2">
                            <span className="min-w-0 truncate">
                              {productName.get(l.productId)}
                              {l.expiryDate ? <span className="text-muted"> · SKT {trDate(l.expiryDate)}</span> : null}
                            </span>
                            <span className="font-bold">+{l.shares[hotel.id]}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button onClick={stepBack} disabled={saving}>
                  Geri
                </Button>
                <Button mutates variant="primary" disabled={saving} onClick={() => void save()}>
                  {saving ? "Kaydediliyor..." : "Kaydet ve otel depolarına ekle"}
                </Button>
              </div>
            </section>
          ) : null}

          <section className={`${CARD} overflow-hidden`}>
            <h2 className="border-b border-border bg-[var(--muted-bg)] px-4 py-3 text-base font-bold">Son tedarikler</h2>
            {receipts.length === 0 ? (
              <p className="py-8 text-center text-muted">Henüz tedarik kaydı yok.</p>
            ) : (
              <ul className="divide-y divide-border">
                {receipts.map((r) => (
                  <li key={r.id} className="px-4 py-3 text-sm">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left"
                      aria-expanded={openReceipt === r.id}
                      onClick={() => setOpenReceipt(openReceipt === r.id ? null : r.id)}
                    >
                      <span className="font-mono font-bold">{r.code}</span>
                      <span>{trDate(r.receivedOn)}</span>
                      {r.documentNo ? <span className="text-muted">evrak {r.documentNo}</span> : null}
                      <span className="font-bold">{r.totalQty} adet</span>
                      <span className="text-muted">{r.source === "GORSEL" ? "görselden" : "elle"} · {r.createdBy}</span>
                    </button>
                    {openReceipt === r.id ? (
                      <div className="mt-2 space-y-1 rounded-[var(--radius-m)] border border-border bg-[var(--muted-bg)] p-3">
                        {r.items.map((item, i) => (
                          <p key={i}>
                            <strong>{item.productName}</strong> · {item.qty} adet
                            {item.expiryDate ? ` · SKT ${trDate(item.expiryDate)}` : ""} →{" "}
                            {item.allocations.map((a) => `${a.hotelName} ${a.qty}`).join(", ")}
                          </p>
                        ))}
                        {r.note ? <p className="text-muted">Not: {r.note}</p> : null}
                        {r.hasImage ? (
                          <a className="font-semibold underline" href={`/api/minibar/receipts/${r.id}/image`} target="_blank" rel="noreferrer">
                            Evrak görselini aç
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
