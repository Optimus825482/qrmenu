"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Icon } from "@/components/icons/Icon";

export type CallResolvedDialogProps = {
  waiterName?: string;
  onClose: () => void;
};

export function CallResolvedDialog({ waiterName, onClose }: CallResolvedDialogProps) {
  const t = useTranslations("guest.call");
  useEffect(() => {
    // Hafif teyit tonu çal
    try {
      if (typeof Audio !== "undefined") {
        const audio = new Audio("/sounds/ready.wav");
        audio.volume = 0.65;
        void audio.play().catch(() => undefined);
      }
    } catch {}
  }, []);

  return (
    <div
      className="g-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 100 }}
    >
      <div
        className="g-sheet"
        style={{
          maxWidth: 420,
          borderRadius: 24,
          padding: "2rem 1.5rem",
          textAlign: "center",
          margin: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: 72,
            height: 72,
            margin: "0 auto 1.25rem",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            color: "#ffffff",
            boxShadow: "0 10px 25px -5px rgba(16, 185, 129, 0.4)",
          }}
        >
          <Icon name="check-circle" size={40} />
        </div>

        <h3
          style={{
            fontSize: "1.5rem",
            fontWeight: 800,
            marginBottom: "0.5rem",
            color: "var(--m-text)",
            lineHeight: 1.2,
          }}
        >
          {t("resolvedTitle")}
        </h3>

        <p
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.5,
            color: "var(--m-text)",
            opacity: 0.9,
            marginBottom: "1rem",
          }}
        >
          {t("resolvedBody")}
        </p>

        {waiterName ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              borderRadius: 12,
              fontSize: "0.85rem",
              fontWeight: 700,
              marginBottom: "1.25rem",
              backgroundColor: "color-mix(in srgb, var(--m-accent) 15%, transparent)",
              color: "var(--m-accent)",
              border: "1px solid color-mix(in srgb, var(--m-accent) 30%, transparent)",
            }}
          >
            <Icon name="user" size={15} />
            <span>{t("resolvedWaiter", { name: waiterName })}</span>
          </div>
        ) : (
          <div style={{ marginBottom: "1rem" }} />
        )}

        <p
          style={{
            fontSize: "0.8rem",
            color: "var(--m-muted)",
            marginBottom: "1.5rem",
          }}
        >
          {t("resolvedWish")}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="g-button g-button-primary"
          style={{
            width: "100%",
            padding: "0.85rem",
            fontSize: "1rem",
            fontWeight: 700,
            borderRadius: 14,
            cursor: "pointer",
          }}
        >
          {t("resolvedOk")}
        </button>
      </div>
    </div>
  );
}
