"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { requestGuide } from "@/components/guide/guideEvents";
import { Icon, type IconName } from "@/components/icons/Icon";
import { LogoutButton } from "@/components/LogoutButton";
import type { OutletTarget } from "@/components/ops/OutletSwitcher";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { selectTargetAction } from "@/modules/core/server/loginAction";

/** Extra profile menu entries added by later tasks (Erişimim, Yardım). */
export type ProfileExtra = { id: string; label: string; icon: IconName; href?: string; onSelect?: () => void };

export type ProfileMenuProps = {
  user: { fullName: string; roleCode: string; roleName: string };
  hotelName: string;
  outletName?: string;
  targets: OutletTarget[];
  /** `targets[].index` of the session's current place (hidden from the switch list). */
  currentTargetIndex?: number;
  extraItems?: ProfileExtra[];
};

/**
 * Profil menüsü: avatar -> Outlet/otel değiştir, Şifre değiştir, Çıkış (en çok iki dokunuş).
 * Yeni bağlama geçince sayfa tam yüklenir: gezinme, yetkiler ve yerel durum yeni bağlamla yeniden hesaplanır.
 */
export function ProfileMenu({ user, hotelName, outletName, targets, currentTargetIndex, extraItems = [] }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const others = targets.filter((t) => t.index !== currentTargetIndex);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    event.preventDefault();
  };

  const switchTo = (index: number) =>
    startTransition(async () => {
      setError("");
      const result = await selectTargetAction(index);
      if (result.ok) window.location.assign(result.data.next);
      else setError(result.error.message);
    });

  return (
    <div ref={root} onKeyDown={onKeyDown} style={{ display: "contents" }}>
      <button
        ref={trigger}
        type="button"
        className="staff-icon-button staff-avatar"
        aria-label={`Profil menüsü, ${user.fullName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="user" size={24} />
      </button>
      {open ? (
        <div className="staff-menu" role="menu" aria-label="Profil">
          <div className="staff-menu-head" role="presentation">
            <strong>{user.fullName}</strong>
            <span>
              {user.roleName} · {hotelName}
              {outletName ? ` · ${outletName}` : ""}
            </span>
          </div>

          {others.length > 0 ? (
            <div role="group" aria-label="Outlet veya otel değiştir">
              <div className="staff-menu-label" role="presentation">Outlet / otel değiştir</div>
              {others.map((target) => (
                <button
                  key={target.index}
                  type="button"
                  role="menuitem"
                  className="staff-menu-item"
                  disabled={pending}
                  onClick={() => switchTo(target.index)}
                >
                  <Icon name="building" size={20} />
                  {target.label}
                </button>
              ))}
              {error ? <p role="alert" className="px-3 text-danger" style={{ fontSize: 14 }}>{error}</p> : null}
            </div>
          ) : null}

          {extraItems.map((item) =>
            item.href ? (
              <Link key={item.id} href={item.href} role="menuitem" className="staff-menu-item" onClick={() => setOpen(false)}>
                <Icon name={item.icon} size={20} />
                {item.label}
              </Link>
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="staff-menu-item"
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                <Icon name={item.icon} size={20} />
                {item.label}
              </button>
            ),
          )}

          <button
            type="button"
            role="menuitem"
            className="staff-menu-item"
            onClick={() => {
              setOpen(false);
              requestGuide("help");
            }}
          >
            <Icon name="help" size={20} />
            Yardım
          </button>

          <button
            type="button"
            role="menuitem"
            className="staff-menu-item"
            onClick={() => {
              setOpen(false);
              setInfo(true);
            }}
          >
            <Icon name="key" size={20} />
            Şifre değiştir
          </button>

          <LogoutButton menuitem label="Çıkış" className="staff-menu-item" />
        </div>
      ) : null}
      <ConfirmSheet
        open={info}
        alert
        title="Şifre değiştirme"
        message="Şifreni bu ekrandan değiştiremezsin. Yöneticinden ya da Otel IT'den yeni bir geçici şifre iste; ilk girişte kendi şifreni belirlersin."
        confirmLabel="Tamam"
        onConfirm={() => setInfo(false)}
        onCancel={() => setInfo(false)}
      />
    </div>
  );
}
