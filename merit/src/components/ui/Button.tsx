import { useId, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  /** Visible explanation of why the action is unavailable; keeps the button focusable (aria-disabled). */
  disabledReason?: string;
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-accent text-white",
  secondary: "border-border bg-surface text-text",
  danger: "border-transparent bg-danger text-white",
  ghost: "border-transparent bg-transparent text-text",
};

export function Button({ variant = "secondary", icon, disabledReason, className, children, onClick, type, style, ...rest }: ButtonProps) {
  const reasonId = useId();
  const blocked = Boolean(disabledReason);
  const primary = variant === "primary";
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (blocked) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  const button = (
    <button
      {...rest}
      type={type ?? "button"}
      data-primary={primary ? "" : undefined}
      aria-disabled={blocked ? "true" : undefined}
      aria-describedby={blocked ? reasonId : rest["aria-describedby"]}
      onClick={handleClick}
      style={{
        minHeight: primary ? "var(--tap-primary)" : "var(--tap-action)",
        minWidth: "var(--tap-action)",
        ...style,
      }}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-m)] border px-4 text-sm font-semibold",
        VARIANT[variant],
        blocked ? "cursor-not-allowed opacity-60" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      {children}
    </button>
  );
  if (!blocked) return button;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {button}
      <small id={reasonId} className="text-muted text-[13px]">
        {disabledReason}
      </small>
    </span>
  );
}
