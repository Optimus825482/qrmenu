"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { changeRequiredPasswordAction } from "@/modules/core/server/loginAction";

const inputClass = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

export function RequiredPasswordForm({ username }: { username: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await changeRequiredPasswordAction({ password, confirmPassword });
      if (!result.ok) { setError(result.error.message); return; }
      router.replace(result.data.next);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-brand">İlk giriş · Şifre belirle</h1>
        <p className="mt-2 text-sm text-muted"><strong>{username}</strong> hesabı için geçici şifre kullanıldı. Devam etmeden önce kişisel şifrenizi belirleyin.</p>
      </header>
      {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="text-sm font-medium">Yeni şifre</label>
        <input id="new-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium">Yeni şifre tekrar</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} />
      </div>
      <p className="text-xs text-muted">En az 10 karakter; büyük harf, küçük harf ve rakam içermeli.</p>
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-brand px-4 text-base font-semibold text-white disabled:opacity-60">{pending ? "Kaydediliyor…" : "Şifremi kaydet ve devam et"}</button>
    </form>
  );
}
