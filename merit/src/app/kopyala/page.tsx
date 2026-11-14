"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The "Kopyala" button of the sign-in mail lands here (`copyLink` in credentialsMail.ts). Mail clients run no
 * script, so the copy happens on this page: the value comes in the fragment (never sent to the server), the
 * fragment is dropped from the address and history at once, and one tap puts the value on the clipboard.
 * Public on purpose (the proxy only guards staff paths): the user is not signed in yet when they need it.
 */
/**
 * The clipboard API is refused in some places a mail link opens (a mail app's built-in browser, a plain-http
 * address, a denied permission): the old selection-based copy still works there.
 */
function legacyCopy(value: string): boolean {
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, value.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export default function KopyalaPage() {
  const [value, setValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  // Read once: the address is cleared right after, and an effect that runs again (Strict Mode) must not
  // find it empty and lose the value.
  const captured = useRef<string | null>(null);

  useEffect(() => {
    if (captured.current === null) {
      const raw = window.location.hash.slice(1);
      try {
        captured.current = decodeURIComponent(raw);
      } catch {
        captured.current = "";
      }
      // Keep the password out of the address bar and the back history.
      if (raw) window.history.replaceState(null, "", window.location.pathname);
    }
    const decoded = captured.current;
    const t = setTimeout(() => setValue(decoded), 0);
    return () => clearTimeout(t);
  }, []);

  const copy = async () => {
    if (!value) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = legacyCopy(value);
    }
    setCopied(ok);
    setFailed(!ok);
  };

  return (
    <main className="min-h-screen bg-bg text-text flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center space-y-4">
        <h1 className="text-base font-bold">Geçici şifre</h1>
        {value === null ? (
          <p className="text-sm text-muted">Yükleniyor…</p>
        ) : value === "" ? (
          <p className="text-sm text-muted">Kopyalanacak bir değer bulunamadı. E-postadaki bağlantıyı yeniden açın.</p>
        ) : (
          <>
            <p
              data-testid="kopyala-deger"
              className="select-all break-all rounded-xl border border-border bg-bg px-4 py-3 font-mono text-lg font-bold tracking-widest"
            >
              {value}
            </p>
            <button
              type="button"
              onClick={() => void copy()}
              style={{ minHeight: "var(--tap-primary, 48px)" }}
              className="w-full rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white hover:opacity-95"
            >
              {copied ? "Kopyalandı ✓" : "Kopyala"}
            </button>
            {failed ? (
              <p role="alert" className="text-xs text-danger">
                Otomatik kopyalanamadı. Şifreye basılı tutup seçin ve kopyalayın.
              </p>
            ) : null}
            <a href="/giris" className="block text-sm font-semibold text-accent hover:underline">
              Giriş ekranına git
            </a>
          </>
        )}
      </section>
    </main>
  );
}
