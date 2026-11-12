import type { Locale } from "@/lib/i18n/locales";

interface FlagIconProps {
  locale: Locale | string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Platformdan bağımsız, her tarayıcı ve işletim sisteminde (Windows, macOS, iOS, Android)
 * %100 net ve canlı renklerde görünen vektör SVG milli bayrak bileşeni.
 */
export function FlagIcon({ locale, width = 20, height = 14, className = "" }: FlagIconProps) {
  const baseStyle: React.CSSProperties = {
    display: "inline-block",
    verticalAlign: "middle",
    borderRadius: "2px",
    overflow: "hidden",
    boxShadow: "0 0 1px rgba(0, 0, 0, 0.3)",
    flexShrink: 0,
  };

  switch (locale.toLowerCase()) {
    case "tr":
      return (
        <svg
          viewBox="0 0 1200 800"
          width={width}
          height={height}
          className={className}
          style={baseStyle}
          aria-hidden="true"
        >
          <rect width="1200" height="800" fill="#e30a17" />
          <circle cx="425" cy="400" r="200" fill="#ffffff" />
          <circle cx="475" cy="400" r="160" fill="#e30a17" />
          <polygon points="583,400 706,440 659,311 659,489 706,360" fill="#ffffff" />
        </svg>
      );

    case "en":
    case "gb":
      return (
        <svg
          viewBox="0 0 60 30"
          width={width}
          height={height}
          className={className}
          style={baseStyle}
          aria-hidden="true"
        >
          <rect width="60" height="30" fill="#012169" />
          <path d="M0 0 L60 30 M60 0 L0 30" stroke="#ffffff" strokeWidth="6" />
          <path d="M0 0 L60 30 M60 0 L0 30" stroke="#c8102e" strokeWidth="2" />
          <path d="M30 0 v30 M0 15 h60" stroke="#ffffff" strokeWidth="10" />
          <path d="M30 0 v30 M0 15 h60" stroke="#c8102e" strokeWidth="6" />
        </svg>
      );

    case "de":
      return (
        <svg
          viewBox="0 0 5 3"
          width={width}
          height={height}
          className={className}
          style={baseStyle}
          aria-hidden="true"
        >
          <rect width="5" height="1" y="0" fill="#000000" />
          <rect width="5" height="1" y="1" fill="#dd0000" />
          <rect width="5" height="1" y="2" fill="#ffce00" />
        </svg>
      );

    case "ru":
      return (
        <svg
          viewBox="0 0 9 6"
          width={width}
          height={height}
          className={className}
          style={baseStyle}
          aria-hidden="true"
        >
          <rect width="9" height="2" y="0" fill="#ffffff" />
          <rect width="9" height="2" y="2" fill="#0039a6" />
          <rect width="9" height="2" y="4" fill="#d52b1e" />
        </svg>
      );

    case "ar":
      return (
        <svg
          viewBox="0 0 6 3"
          width={width}
          height={height}
          className={className}
          style={baseStyle}
          aria-hidden="true"
        >
          <rect width="6" height="1" y="0" fill="#00732f" />
          <rect width="6" height="1" y="1" fill="#ffffff" />
          <rect width="6" height="1" y="2" fill="#000000" />
          <rect width="1.8" height="3" x="0" y="0" fill="#ff0000" />
        </svg>
      );

    case "fr":
      return (
        <svg
          viewBox="0 0 3 2"
          width={width}
          height={height}
          className={className}
          style={baseStyle}
          aria-hidden="true"
        >
          <rect width="1" height="2" x="0" fill="#002654" />
          <rect width="1" height="2" x="1" fill="#ffffff" />
          <rect width="1" height="2" x="2" fill="#ce1126" />
        </svg>
      );

    case "el":
      return (
        <svg
          viewBox="0 0 27 18"
          width={width}
          height={height}
          className={className}
          style={baseStyle}
          aria-hidden="true"
        >
          <rect width="27" height="18" fill="#0d5eaf" />
          <path d="M0 2h27 M0 6h27 M0 10h27 M0 14h27" stroke="#ffffff" strokeWidth="2" />
          <rect width="10" height="10" fill="#0d5eaf" />
          <path d="M0 5h10 M5 0v10" stroke="#ffffff" strokeWidth="2" />
        </svg>
      );

    case "it":
      return (
        <svg
          viewBox="0 0 3 2"
          width={width}
          height={height}
          className={className}
          style={baseStyle}
          aria-hidden="true"
        >
          <rect width="1" height="2" x="0" fill="#009246" />
          <rect width="1" height="2" x="1" fill="#ffffff" />
          <rect width="1" height="2" x="2" fill="#ce2b37" />
        </svg>
      );

    case "pt":
    case "br":
      // Brazil: green field, yellow rhombus, blue disc with the white band.
      return (
        <svg
          viewBox="0 0 20 14"
          width={width}
          height={height}
          className={className}
          style={baseStyle}
          aria-hidden="true"
        >
          <rect width="20" height="14" fill="#009c3b" />
          <polygon points="10,1.7 18.3,7 10,12.3 1.7,7" fill="#ffdf00" />
          <circle cx="10" cy="7" r="3.5" fill="#002776" />
          <path d="M6.6 6.2 Q10 5.4 13.4 8" fill="none" stroke="#ffffff" strokeWidth="0.7" />
        </svg>
      );

    default:
      return null;
  }
}
