import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center text-text">
        <h1 className="text-lg font-bold">Sayfa bulunamadı</h1>
        <p className="mt-2 text-sm text-muted">Aradığınız sayfa yok ya da taşınmış olabilir.</p>
        <Link
          href="/"
          style={{ minHeight: "var(--tap-action, 44px)" }}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[color:var(--on-accent)]"
        >
          Ana sayfa
        </Link>
      </div>
    </main>
  );
}
