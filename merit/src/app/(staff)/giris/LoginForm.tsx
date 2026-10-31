"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useHydrated } from "@/components/useHydrated";
import { safeNextPath } from "@/lib/safe-next";
import { loginAction } from "@/modules/core/server/loginAction";

type FormState =
  | { status: "idle"; username: string }
  | { status: "error"; username: string; message: string }
  | { status: "done"; username: string };

const INITIAL: FormState = { status: "idle", username: "" };

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text placeholder:text-muted/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const hydrated = useHydrated();

  const [state, submit, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const username = String(formData.get("username") ?? "");
      const result = await loginAction({
        username,
        password: String(formData.get("password") ?? ""),
      });
      if (!result.ok) return { status: "error", username, message: result.error.message };

      // Several targets (or none): /secim decides. Otherwise honor ?next=, else the role's screen.
      const goToPicker = result.data.next === "/secim";
      const to = goToPicker ? "/secim" : (safeNextPath(next) ?? result.data.next);
      router.replace(to);
      return { status: "done", username };
    },
    INITIAL,
  );

  const busy = pending || state.status === "done";

  return (
    <form action={submit} className="flex flex-col gap-5" aria-busy={busy}>
      <header className="text-center">
        <h1 className="text-2xl font-bold tracking-[0.2em] text-brand">MERIT OS</h1>
        <p className="mt-1 text-sm text-muted">Personel girişi</p>
      </header>

      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {state.message}
        </p>
      )}

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
          defaultValue={state.username}
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
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={!hydrated || busy}
        className="min-h-11 rounded-lg bg-brand px-4 text-base font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        Giriş Yap
      </button>
    </form>
  );
}
