/** Hafif kök yükleme durumu: animasyonsuz, yalnız erişilebilir durum metni. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-muted">
      Yükleniyor…
    </div>
  );
}
