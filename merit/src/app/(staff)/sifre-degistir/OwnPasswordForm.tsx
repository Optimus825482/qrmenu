"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { changeOwnPasswordAction } from "@/modules/core/server/loginAction";

const inputClass = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

export function OwnPasswordForm({ username }: { username: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await changeOwnPasswordAction({ currentPassword, password, confirmPassword });
      if (!result.ok) {
        const field = result.error.fieldErrors;
        setError(field?.currentPassword?.[0] ?? field?.password?.[0] ?? field?.confirmPassword?.[0] ?? result.error.message);
        return;
      }
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setDone(true);
    });
  };

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold text-brand">Şifre değiştirildi</h1>
        <p role="status" className="text-sm text-muted">Yeni şifreniz kaydedildi. Diğer cihazlardaki oturumlarınız kapatıldı.</p>
        <Link href="/baslat" className="flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 text-base font-semibold text-white">Devam et</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-brand">Şifre değiştir</h1>
        <p className="mt-2 text-sm text-muted"><strong>{username}</strong> hesabının şifresini değiştirmek için önce mevcut şifrenizi girin.</p>
      </header>
      {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="current-password" className="text-sm font-medium">Mevcut şifre</label>
        <input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="text-sm font-medium">Yeni şifre</label>
        <input id="new-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium">Yeni şifre tekrar</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} />
      </div>
      <p className="text-xs text-muted">En az 10 karakter; büyük harf, küçük harf ve rakam içermeli.</p>
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-brand px-4 text-base font-semibold text-white disabled:opacity-60">{pending ? "Kaydediliyor…" : "Şifremi değiştir"}</button>
    </form>
  );
}
