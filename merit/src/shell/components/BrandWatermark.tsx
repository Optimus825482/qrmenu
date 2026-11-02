/**
 * Brand mark on the wallpaper (Denetim Masası → Marka → "Duvar kağıdı filigranı"):
 * Luxury 24K Gold Merit Royal Imperial Crest and "F&B COMMAND CENTER" title.
 * Decoration only: hidden from assistive tech and transparent to the pointer.
 */
export function BrandWatermark() {
  return (
    <div className="xp-brand-watermark" aria-hidden="true">
      <div className="xp-brand-crest">
        <svg
          width="92"
          height="92"
          viewBox="0 0 100 100"
          className="xp-brand-crest-svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="crestGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fff3d1" />
              <stop offset="35%" stopColor="#dfb76c" />
              <stop offset="70%" stopColor="#b88928" />
              <stop offset="100%" stopColor="#f5dc98" />
            </linearGradient>
            <radialGradient id="crestHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#dfb76c" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#dfb76c" stopOpacity="0" />
            </radialGradient>
            <filter id="crestGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
            </filter>
          </defs>
          <circle cx="50" cy="50" r="46" fill="url(#crestHalo)" />
          <g filter="url(#crestGlow)">
            {/* 5-Point Imperial Crown */}
            <path
              d="M32 36 L27 24 L37 30 L43 19 L50 28 L57 19 L63 30 L73 24 L68 36 Z"
              fill="url(#crestGold)"
            />
            <circle cx="27" cy="23" r="2" fill="url(#crestGold)" />
            <circle cx="43" cy="18" r="2.2" fill="url(#crestGold)" />
            <circle cx="50" cy="27" r="1.5" fill="url(#crestGold)" />
            <circle cx="57" cy="18" r="2.2" fill="url(#crestGold)" />
            <circle cx="73" cy="23" r="2" fill="url(#crestGold)" />
            <rect x="29" y="36" width="42" height="3" rx="1.5" fill="url(#crestGold)" />
            <circle cx="50" cy="37.5" r="1.2" fill="#e74c3c" />
            <circle cx="42" cy="37.5" r="0.9" fill="#ffffff" />
            <circle cx="58" cy="37.5" r="0.9" fill="#ffffff" />

            {/* Regal Monogram M */}
            <path
              d="M35 73 L35 44 L43 44 L50 58 L57 44 L65 44 L65 73 L58.5 73 L58.5 53 L52.5 64 L47.5 64 L41.5 53 L41.5 73 Z"
              fill="url(#crestGold)"
            />

            {/* Laurel Wreath */}
            <path
              d="M24 60 C20 52 22 42 26 36 C24 40 24 46 27 50 C23 46 22 40 24 36 C20 42 20 50 24 56 Z"
              fill="url(#crestGold)"
              opacity="0.9"
            />
            <path
              d="M26 62 C30 70 36 74 44 76 C38 74 34 70 32 64 C36 68 42 71 48 72 C42 70 36 66 34 60 Z"
              fill="url(#crestGold)"
              opacity="0.9"
            />
            <path
              d="M76 60 C80 52 78 42 74 36 C76 40 76 46 73 50 C77 46 78 40 76 36 C80 42 80 50 76 56 Z"
              fill="url(#crestGold)"
              opacity="0.9"
            />
            <path
              d="M74 62 C70 70 64 74 56 76 C62 74 66 70 68 64 C64 68 58 71 52 72 C58 70 64 66 66 60 Z"
              fill="url(#crestGold)"
              opacity="0.9"
            />
            <polygon points="50,72 52,77 57,77 53,80 55,85 50,82 45,85 47,80 43,77 48,77" fill="url(#crestGold)" />
          </g>
        </svg>
      </div>
      <div className="xp-brand-subheading">MERIT ROYAL HOTELS &amp; RESORTS</div>
      <div className="xp-brand-title">F&amp;B COMMAND CENTER</div>
      <div className="xp-brand-rule" />
      <div className="xp-brand-subtitle">EXECUTIVE OPERATIONS &amp; INTELLIGENCE PLATFORM</div>
    </div>
  );
}
