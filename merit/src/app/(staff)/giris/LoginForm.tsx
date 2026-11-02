"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState } from "react";
import { useHydrated } from "@/components/useHydrated";
import { safeNextPath } from "@/lib/safe-next";
import { loginAction, selectTargetAction } from "@/modules/core/server/loginAction";
import type { Target } from "@/modules/core/server/targets";

type FormState =
  | { status: "idle"; username: string }
  | { status: "error"; username: string; message: string; targets?: Target[] }
  | { status: "choosing"; username: string; targets: Target[] }
  | { status: "done"; username: string };

const INITIAL: FormState = { status: "idle", username: "" };
const REMEMBERED_USERNAME_KEY = "merit.rememberedUsername";

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text placeholder:text-muted/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    let rememberedUsername: string | null = null;
    try {
      rememberedUsername = window.localStorage.getItem(REMEMBERED_USERNAME_KEY);
    } catch {
      // Login remains usable when browser storage is disabled.
    }
    if (!rememberedUsername) return;
    const timer = window.setTimeout(() => {
      setUsername(rememberedUsername);
      setRememberMe(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const [state, submit, pending] = useActionState(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      if (formData.get("action") === "reset") {
        return INITIAL;
      }
      const targetIndex = formData.get("targetIndex");
      if (targetIndex !== null) {
        const result = await selectTargetAction(Number(targetIndex));
        if (!result.ok) {
          const targets = previous.status === "choosing" || previous.status === "error" ? previous.targets : undefined;
          return {
            status: "error",
            username: previous.username,
            message: result.error.message,
            ...(targets ? { targets } : {}),
          };
        }
        router.replace(result.data.next);
        return { status: "done", username: previous.username };
      }
      const username = String(formData.get("username") ?? "");
      const password = String(formData.get("password") ?? "");
      setUsername(username);
      setPassword(password);
      const remember = formData.get("rememberMe") === "on";
      const result = await loginAction({
        username,
        password,
      });
      if (!result.ok) return { status: "error", username, message: result.error.message };

      try {
        if (remember) window.localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
        else window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      } catch {
        // Remembering the username is optional; a storage restriction must not block login.
      }

      // After credential verification, show the available workspace options in this login form.
      const goToPicker = result.data.next === "/secim";
      if (goToPicker && result.data.targets.length > 0) {
        return { status: "choosing", username, targets: result.data.targets };
      }
      const to = result.data.next === "/sifre-degistir"
        ? result.data.next
        : goToPicker ? "/secim" : (safeNextPath(next) ?? result.data.next);
      router.replace(to);
      return { status: "done", username };
    },
    INITIAL,
  );

  const busy = pending || state.status === "done";

  return (
    <form action={submit} className="flex flex-col gap-5" aria-busy={busy}>
      <header className="text-center">
        <Image
          src="/brand/merit-royal-logo-thumb.png"
          alt="Merit Royal"
          width={300}
          height={288}
          priority
          className="mx-auto mb-2 w-auto"
          style={{ maxHeight: 48 }}
        />
        <h1 className="text-xl font-bold tracking-[0.18em] text-brand uppercase">F&amp;B COMMAND CENTER</h1>
        <p className="mt-1 text-xs tracking-wider text-muted font-medium">MERIT ROYAL HOTELS &amp; RESORTS</p>
      </header>

      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {state.message}
        </p>
      )}

      {state.status === "choosing" || (state.status === "error" && state.targets) ? (
        <section className="flex flex-col gap-3" aria-labelledby="target-title">
          <h2 id="target-title" className="text-lg font-semibold text-brand">Çalışacağınız outleti seçin</h2>
          {(state.status === "choosing" ? state.targets : state.targets ?? []).map((target, index) => (
            <button
              key={`${target.kind}-${target.hotelId}-${target.outletId ?? ""}`}
              type="submit"
              name="targetIndex"
              value={index}
              disabled={busy}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent hover:bg-bg disabled:opacity-60"
            >
              <span>
                <strong className="block">{target.label}</strong>
                <span className="text-sm text-muted">{target.hotelName}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const fd = new FormData();
              fd.set("action", "reset");
              startTransition(() => {
                submit(fd);
              });
            }}
            className="mt-1 text-center text-xs text-muted hover:text-brand underline"
          >
            ← Farklı kullanıcı ile giriş yap
          </button>
        </section>
      ) : null}

      {state.status !== "choosing" && !(state.status === "error" && state.targets) ? <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-sm font-medium">
          Kullanıcı adı
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Şifre
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </div>

      <label htmlFor="rememberMe" className="-mt-1 flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
        <input
          id="rememberMe"
          name="rememberMe"
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => {
            const checked = event.target.checked;
            setRememberMe(checked);
            if (!checked) {
              try {
                window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
              } catch {
                // Ignore unavailable browser storage.
              }
            }
          }}
          className="size-4 accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        Beni hatırla
      </label>

      <button
        type="submit"
        disabled={!hydrated || busy}
        className="min-h-11 rounded-lg bg-brand px-4 text-base font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        Giriş Yap
      </button>
      </> : null}
    </form>
  );
}
