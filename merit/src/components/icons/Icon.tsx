import { ICON_PATHS, type IconName } from "./paths";

export type { IconName } from "./paths";

export type IconProps = {
  name: IconName;
  /** Piksel; tutarlı kademeler: 16 (yoğun XP), 20 (satır içi), 24 (bağımsız), büyük boş durum 32+. */
  size?: number;
  /** Verilirse ikon anlam taşır (`role="img"` + `<title>`); verilmezse süs (`aria-hidden`). */
  title?: string;
  className?: string;
};

/** Merit ikon seti: 24 px ızgara, 2 px çizgi, `currentColor`. Sunucu ve istemci bileşenlerinde kullanılır. */
export function Icon({ name, size = 24, title, className }: IconProps) {
  const paths = ICON_PATHS[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={`merit-icon inline-block shrink-0 align-[-0.2em]${className ? ` ${className}` : ""}`}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      {title ? <title>{title}</title> : null}
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function isIconName(value: string): value is IconName {
  return Object.prototype.hasOwnProperty.call(ICON_PATHS, value);
}
