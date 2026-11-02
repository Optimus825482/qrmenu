import type { ReactNode } from "react";

/**
 * Premium Merit Royal OS Icon Suite.
 * Crafted with high-fidelity gradients, 3D lighting, metallic bevels, and luxury hospitality aesthetic.
 * Scalable vector graphics designed on a 48×48 high-precision grid.
 */

const GLYPHS: Record<string, ReactNode> = {
  // 1. KOMUTA MERKEZİ: Modern curved ultra-wide command console with glowing HUD analytics
  komuta: (
    <>
      <defs>
        <linearGradient id="km-frame" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2c3e50" />
          <stop offset="50%" stopColor="#1a252f" />
          <stop offset="100%" stopColor="#0d1318" />
        </linearGradient>
        <linearGradient id="km-screen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#091428" />
          <stop offset="100%" stopColor="#040914" />
        </linearGradient>
        <linearGradient id="km-stand" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7f8c8d" />
          <stop offset="50%" stopColor="#bdc3c7" />
          <stop offset="100%" stopColor="#95a5a6" />
        </linearGradient>
        <linearGradient id="km-cyan" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#00f2fe" />
          <stop offset="100%" stopColor="#4facfe" />
        </linearGradient>
        <linearGradient id="km-area" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#00f2fe" stopOpacity="0.0" />
        </linearGradient>
        <linearGradient id="km-green" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2ecc71" />
          <stop offset="100%" stopColor="#27ae60" />
        </linearGradient>
        <linearGradient id="km-gold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f39c12" />
          <stop offset="100%" stopColor="#d35400" />
        </linearGradient>
        <linearGradient id="km-red" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ff4757" />
          <stop offset="100%" stopColor="#ee5253" />
        </linearGradient>
      </defs>
      {/* Stand base & neck */}
      <path d="M18 36 L16 42 L32 42 L30 36 Z" fill="url(#km-stand)" />
      <ellipse cx="24" cy="42" rx="13" ry="3.5" fill="url(#km-stand)" />
      <ellipse cx="24" cy="41.5" rx="10" ry="2" fill="#7f8c8d" opacity="0.6" />
      {/* Outer monitor frame */}
      <rect x="3" y="6" width="42" height="30" rx="3.5" fill="url(#km-frame)" />
      <rect x="3.5" y="6.5" width="41" height="29" rx="3" fill="none" stroke="#4a6572" strokeWidth="0.8" />
      {/* Inner Screen */}
      <rect x="5.5" y="8.5" width="37" height="23" rx="2" fill="url(#km-screen)" />
      {/* Glowing area chart */}
      <path d="M7 23 Q 13 16, 18 19 T 28 14 T 39 12 L39 27 L7 27 Z" fill="url(#km-area)" />
      <path d="M7 23 Q 13 16, 18 19 T 28 14 T 39 12" fill="none" stroke="url(#km-cyan)" strokeWidth="1.8" strokeLinecap="round" />
      {/* KPI metric bars */}
      <rect x="9" y="19" width="3" height="8" rx="0.8" fill="url(#km-green)" />
      <rect x="14" y="15" width="3" height="12" rx="0.8" fill="url(#km-cyan)" />
      <rect x="19" y="17" width="3" height="10" rx="0.8" fill="url(#km-gold)" />
      <rect x="24" y="21" width="3" height="6" rx="0.8" fill="url(#km-green)" />
      {/* Mini status indicator panel on top right */}
      <rect x="29" y="10" width="12" height="6" rx="1" fill="#0b1b33" stroke="#1f4068" strokeWidth="0.6" />
      <circle cx="32" cy="13" r="1.2" fill="#2ecc71" />
      <rect x="35" y="12" width="4.5" height="1.8" rx="0.5" fill="#4facfe" />
      {/* Glass specular sheen across screen */}
      <path d="M5.5 8.5 L24 8.5 L8 28.5 L5.5 28.5 Z" fill="#ffffff" opacity="0.08" />
      {/* Power LED badge */}
      <circle cx="24" cy="33.5" r="0.9" fill="#00f2fe" />
    </>
  ),

  // 2. KLASÖR: Luxury Windows XP / Executive 3D Amber Folder
  klasor: (
    <>
      <defs>
        <linearGradient id="kf-back" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f9ca24" />
          <stop offset="100%" stopColor="#f0932b" />
        </linearGradient>
        <linearGradient id="kf-front" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffeaa7" />
          <stop offset="25%" stopColor="#fdcb6e" />
          <stop offset="100%" stopColor="#e17055" />
        </linearGradient>
        <linearGradient id="kf-paper" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dfe6e9" />
        </linearGradient>
        <linearGradient id="kf-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffeaa7" />
          <stop offset="100%" stopColor="#d35400" />
        </linearGradient>
      </defs>
      {/* Back tab and body */}
      <path
        d="M5 12 C5 9.8 6.8 8 9 8 L19 8 C21 8 22.5 9.5 24 11 L27 14 L41 14 C43.2 14 45 15.8 45 18 L45 37 C45 39.2 43.2 41 41 41 L7 41 C4.8 41 3 39.2 3 37 Z"
        fill="url(#kf-back)"
      />
      {/* White document pages inside */}
      <rect x="8" y="11" width="28" height="24" rx="1.5" fill="url(#kf-paper)" transform="rotate(-3 22 23)" />
      <line x1="12" y1="16" x2="28" y2="16" stroke="#b2bec3" strokeWidth="1" strokeLinecap="round" transform="rotate(-3 22 23)" />
      <line x1="12" y1="20" x2="25" y2="20" stroke="#b2bec3" strokeWidth="1" strokeLinecap="round" transform="rotate(-3 22 23)" />
      <rect x="10" y="12" width="28" height="24" rx="1.5" fill="#ffffff" />
      <line x1="14" y1="17" x2="30" y2="17" stroke="#b2bec3" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="14" y1="21" x2="27" y2="21" stroke="#b2bec3" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="14" y1="25" x2="32" y2="25" stroke="#b2bec3" strokeWidth="1.2" strokeLinecap="round" />
      {/* Front flap tilted with 3D bevel */}
      <path
        d="M3 20 C3 18.2 4.5 17 6.5 17 L41.5 17 C43.5 17 45 18.2 45 20 L42 39 C42 41.2 40.2 43 38 43 L8 43 C5.8 43 4 41.2 4 39 Z"
        fill="url(#kf-front)"
      />
      {/* Flap top highlight edge */}
      <path d="M5.5 18.2 L42.5 18.2" stroke="#ffffff" strokeWidth="1.2" strokeOpacity="0.75" />
      {/* Embossed Royal Star emblem on front */}
      <polygon points="24,26 25.5,29.5 29,30 26.5,32.5 27,36 24,34 21,36 21.5,32.5 19,30 22.5,29.5" fill="url(#kf-gold)" opacity="0.9" />
    </>
  ),

  // 3. SERVİS: Gleaming 5-Star Hotel Room Service Cloche & Silver Platter
  servis: (
    <>
      <defs>
        <linearGradient id="sv-silver" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#e2e8f0" />
          <stop offset="70%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
        <linearGradient id="sv-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="50%" stopColor="#e5a93c" />
          <stop offset="100%" stopColor="#a36e14" />
        </linearGradient>
        <linearGradient id="sv-tray" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="50%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>
      {/* Serving Platter Tray Base */}
      <ellipse cx="24" cy="38" rx="20" ry="4.5" fill="url(#sv-tray)" />
      <ellipse cx="24" cy="37.5" rx="18.5" ry="3.5" fill="#f1f5f9" />
      <ellipse cx="24" cy="37" rx="16" ry="2.8" fill="#e2e8f0" />
      {/* Platter Handles */}
      <rect x="2" y="36.5" width="3" height="2" rx="1" fill="url(#sv-gold)" />
      <rect x="43" y="36.5" width="3" height="2" rx="1" fill="url(#sv-gold)" />
      {/* Cloche Dome Cover */}
      <path
        d="M9 35 C9 22 15 15 24 15 C33 15 39 22 39 35 Z"
        fill="url(#sv-silver)"
      />
      {/* Specular White Shine Streak */}
      <path
        d="M17 34 C16 26 19 19 23 16 C20 19 18 26 19 34 Z"
        fill="#ffffff"
        opacity="0.65"
      />
      {/* Gold Trim Ring around base */}
      <rect x="8.5" y="33.5" width="31" height="2.5" rx="1.2" fill="url(#sv-gold)" />
      {/* Polished Acorn Handle on Top */}
      <circle cx="24" cy="13.5" r="3.2" fill="url(#sv-gold)" />
      <circle cx="23" cy="12.5" r="1.2" fill="#ffffff" opacity="0.8" />
      <rect x="22.5" y="14" width="3" height="2.5" rx="0.8" fill="url(#sv-gold)" />
      {/* Fresh Hot Service Sparkles */}
      <polygon points="12,12 13,15 16,16 13,17 12,20 11,17 8,16 11,15" fill="#fcd34d" opacity="0.85" />
      <polygon points="36,13 37,15 39,16 37,17 36,19 35,17 33,16 35,15" fill="#fcd34d" opacity="0.75" />
    </>
  ),

  // 4. MİNİBAR: Luxury Glass-Door Hotel Minibar Refrigerator with Bottles & Cans
  minibar: (
    <>
      <defs>
        <linearGradient id="mb-frame" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="50%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="mb-glass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0c2340" />
          <stop offset="100%" stopColor="#031124" />
        </linearGradient>
        <linearGradient id="mb-gold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
      {/* Outer Fridge Cabinet */}
      <rect x="7" y="4" width="34" height="40" rx="3.5" fill="url(#mb-frame)" />
      <rect x="8" y="5" width="32" height="38" rx="2.8" fill="none" stroke="#64748b" strokeWidth="1" />
      {/* Interior Glass Window */}
      <rect x="10.5" y="7.5" width="27" height="33" rx="1.8" fill="url(#mb-glass)" />
      {/* Internal LED Glow */}
      <rect x="11" y="8" width="26" height="4" fill="#38bdf8" opacity="0.3" filter="blur(1px)" />
      {/* Wire Shelves */}
      <line x1="11" y1="20" x2="37" y2="20" stroke="#94a3b8" strokeWidth="1.2" opacity="0.7" />
      <line x1="11" y1="31" x2="37" y2="31" stroke="#94a3b8" strokeWidth="1.2" opacity="0.7" />
      {/* Top Shelf Items: Champagne & Wine Bottles */}
      {/* Champagne Bottle (Green with Gold Neck) */}
      <rect x="13.5" y="13" width="4.5" height="7" rx="1" fill="#14532d" />
      <rect x="14.5" y="10" width="2.5" height="3.5" fill="url(#mb-gold)" />
      <circle cx="15.7" cy="9.5" r="1.3" fill="url(#mb-gold)" />
      {/* Wine Bottle (Deep Ruby) */}
      <rect x="19.5" y="12" width="4.5" height="8" rx="1" fill="#881337" />
      <rect x="20.5" y="9.5" width="2.5" height="3" fill="#be123c" />
      {/* Water Bottle (Ice Cyan) */}
      <rect x="25.5" y="13" width="4" height="7" rx="1" fill="#0284c7" />
      <rect x="26.5" y="10.5" width="2" height="2.5" fill="#38bdf8" />
      {/* Middle Shelf Items: Cans (Soda, Tonic, Beer) */}
      {/* Cola Can Red */}
      <rect x="13" y="23" width="4.5" height="8" rx="1" fill="#dc2626" />
      <rect x="13" y="22.5" width="4.5" height="1" fill="#f1f5f9" />
      {/* Tonic Can Sapphire */}
      <rect x="19" y="23" width="4.5" height="8" rx="1" fill="#2563eb" />
      <rect x="19" y="22.5" width="4.5" height="1" fill="#f1f5f9" />
      {/* Gold Energy Can */}
      <rect x="25" y="23" width="4.5" height="8" rx="1" fill="url(#mb-gold)" />
      <rect x="25" y="22.5" width="4.5" height="1" fill="#f1f5f9" />
      {/* Bottom Shelf Items: Juice & Snacks */}
      <rect x="14" y="33" width="5.5" height="7" rx="1.2" fill="#ea580c" />
      <rect x="21" y="34" width="7" height="6" rx="1.2" fill="#059669" />
      {/* Glass Diagonal Reflection Highlight */}
      <path d="M11 7.5 L24 7.5 L12 36 L11 36 Z" fill="#ffffff" opacity="0.12" />
      {/* Stainless Steel Tubular Handle on right */}
      <rect x="34" y="14" width="2.2" height="19" rx="1.1" fill="#e2e8f0" stroke="#475569" strokeWidth="0.5" />
    </>
  ),

  // 5. AYARLAR & SİSTEM: Precision-Cut 3D Gear & Executive System Console
  ayarlar: (
    <>
      <defs>
        <linearGradient id="ay-gear" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="40%" stopColor="#cbd5e1" />
          <stop offset="80%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="ay-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
        <linearGradient id="ay-card" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      {/* Background Console Frame */}
      <rect x="4" y="5" width="34" height="30" rx="3" fill="url(#ay-card)" stroke="#3b82f6" strokeWidth="1" />
      <rect x="7" y="9" width="28" height="4" rx="1" fill="#1e40af" />
      <circle cx="10" cy="11" r="1.2" fill="#ef4444" />
      <circle cx="13.5" cy="11" r="1.2" fill="#eab308" />
      <circle cx="17" cy="11" r="1.2" fill="#22c55e" />
      {/* Sliders on Console */}
      <line x1="8" y1="18" x2="22" y2="18" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="18" r="2.5" fill="url(#ay-gold)" />
      <line x1="8" y1="25" x2="22" y2="25" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="25" r="2.5" fill="#38bdf8" />
      {/* Big Interlocking 3D Silver Gear in Foreground */}
      <g transform="translate(30, 31)">
        <circle cx="0" cy="0" r="14" fill="url(#ay-gear)" />
        {/* Teeth */}
        <rect x="-2.5" y="-16" width="5" height="32" rx="1" fill="url(#ay-gear)" />
        <rect x="-16" y="-2.5" width="32" height="5" rx="1" fill="url(#ay-gear)" />
        <rect x="-2.5" y="-16" width="5" height="32" rx="1" fill="url(#ay-gear)" transform="rotate(45)" />
        <rect x="-16" y="-2.5" width="32" height="5" rx="1" fill="url(#ay-gear)" transform="rotate(45)" />
        {/* Gear Hub */}
        <circle cx="0" cy="0" r="10" fill="url(#ay-gear)" />
        <circle cx="0" cy="0" r="6" fill="#1e293b" />
        <circle cx="0" cy="0" r="3" fill="url(#ay-gold)" />
      </g>
    </>
  ),

  // 6. KULLANICILAR: VIP Executive ID Badge with Lanyard & Security Token
  kullanicilar: (
    <>
      <defs>
        <linearGradient id="ku-badge" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>
        <linearGradient id="ku-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
        <linearGradient id="ku-blue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      {/* Lanyard Strap at top */}
      <path d="M17 1 L24 10 L31 1" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M19 1 L24 8 L29 1" stroke="url(#ku-gold)" strokeWidth="1" fill="none" />
      {/* Metallic Lanyard Clip */}
      <rect x="22" y="9" width="4" height="4" rx="1" fill="#94a3b8" />
      <ellipse cx="24" cy="14" rx="2" ry="1.5" fill="#64748b" />
      {/* Main VIP Badge Card */}
      <rect x="9" y="13" width="30" height="32" rx="3.5" fill="url(#ku-badge)" stroke="#cbd5e1" strokeWidth="1" />
      {/* Top Royal Blue Header */}
      <path d="M9 16.5 C9 14.5 10.5 13 12.5 13 L35.5 13 C37.5 13 39 14.5 39 16.5 L39 21 L9 21 Z" fill="url(#ku-blue)" />
      <circle cx="24" cy="17" r="1.5" fill="url(#ku-gold)" />
      {/* User Silhouette Avatar */}
      <circle cx="24" cy="27" r="4.5" fill="#3b82f6" />
      <path d="M16 38 C16 34 19.5 32 24 32 C28.5 32 32 34 32 38 Z" fill="#1e3a8a" />
      {/* Gold Security Shield in corner */}
      <path d="M30 35 L34 37 L34 40 C34 42 32 44 30 45 C28 44 26 42 26 40 L26 37 Z" fill="url(#ku-gold)" />
      {/* Data Lines below avatar */}
      <line x1="13" y1="41" x2="22" y2="41" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),

  // 7. OTEL: 5-Star Grand Luxury Palace Resort Façade
  otel: (
    <>
      <defs>
        <linearGradient id="ot-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="40%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
        <linearGradient id="ot-stone" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>
      {/* Royal Crown atop pediment */}
      <polygon points="24,4 26,7 29,6 27,9 29,11 25,10 24,12 23,10 19,11 21,9 19,6 22,7" fill="url(#ot-gold)" />
      {/* Triangular Grand Pediment */}
      <polygon points="24,10 5,19 43,19" fill="url(#ot-stone)" stroke="#94a3b8" strokeWidth="0.8" />
      <polygon points="24,13 11,18 37,18" fill="url(#ot-gold)" opacity="0.85" />
      {/* Entablature Beam */}
      <rect x="7" y="19" width="34" height="3" fill="url(#ot-stone)" />
      {/* 4 Majestic Roman Columns */}
      <rect x="9.5" y="22" width="4.5" height="18" fill="url(#ot-stone)" stroke="#94a3b8" strokeWidth="0.5" />
      <rect x="18" y="22" width="4.5" height="18" fill="url(#ot-stone)" stroke="#94a3b8" strokeWidth="0.5" />
      <rect x="25.5" y="22" width="4.5" height="18" fill="url(#ot-stone)" stroke="#94a3b8" strokeWidth="0.5" />
      <rect x="34" y="22" width="4.5" height="18" fill="url(#ot-stone)" stroke="#94a3b8" strokeWidth="0.5" />
      {/* Column Base / Plinth */}
      <rect x="6" y="40" width="36" height="4" rx="1" fill="url(#ot-stone)" />
      {/* Palace Windows & Arched Entrance behind columns */}
      <rect x="16" y="25" width="2" height="4" rx="1" fill="#fef08a" opacity="0.9" />
      <rect x="30" y="25" width="2" height="4" rx="1" fill="#fef08a" opacity="0.9" />
      {/* Center Grand Arched Double Doorway */}
      <path d="M21 40 L21 32 C21 30.5 22.3 29 24 29 C25.7 29 27 30.5 27 32 L27 40 Z" fill="url(#ot-gold)" />
    </>
  ),

  // 8. MENÜ: Padded Leather F&B Restaurant Folio with Gold Corners & Ribbon
  menu: (
    <>
      <defs>
        <linearGradient id="mn-leather" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="50%" stopColor="#172554" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="mn-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
      </defs>
      {/* Silk Ribbon Bookmark dangling */}
      <path d="M22 36 L22 46 L25.5 43 L29 46 L29 36 Z" fill="#ef4444" />
      {/* Main Bound Folio Cover */}
      <rect x="8" y="5" width="32" height="37" rx="3.5" fill="url(#mn-leather)" stroke="#3b82f6" strokeWidth="0.8" />
      {/* Spine on Left */}
      <rect x="8" y="5" width="4.5" height="37" rx="1.5" fill="#0f172a" />
      <line x1="12.5" y1="5" x2="12.5" y2="42" stroke="url(#mn-gold)" strokeWidth="0.8" />
      {/* Gold Corner Embellishments */}
      <polygon points="14,6 20,6 14,12" fill="url(#mn-gold)" />
      <polygon points="38,6 32,6 38,12" fill="url(#mn-gold)" />
      <polygon points="38,40 32,40 38,34" fill="url(#mn-gold)" />
      <polygon points="14,40 20,40 14,34" fill="url(#mn-gold)" />
      {/* Center Embossed Cutlery & Star */}
      <circle cx="26" cy="22" r="8.5" fill="none" stroke="url(#mn-gold)" strokeWidth="1" strokeDasharray="2,1" />
      {/* Fork */}
      <path d="M23 18 L23 21 M24.5 18 L24.5 21 M21.5 18 L21.5 21 M21.5 21 C21.5 23 24.5 23 24.5 21 L23 27" stroke="url(#mn-gold)" strokeWidth="1" strokeLinecap="round" />
      {/* Knife */}
      <path d="M28 17 C28 17 26 19 26 23 L26 27" stroke="url(#mn-gold)" strokeWidth="1.2" strokeLinecap="round" />
      {/* Star */}
      <polygon points="26,14 26.8,16 29,16 27.2,17.2 27.8,19 26,17.8 24.2,19 24.8,17.2 23,16 25.2,16" fill="url(#mn-gold)" />
    </>
  ),

  // 9. TEMA: Artist Wooden Palette & Golden Fine Paintbrush
  tema: (
    <>
      <defs>
        <linearGradient id="tm-wood" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="40%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>
      {/* Wooden Palette Base */}
      <path
        d="M24 6 C12 6 5 13 5 24 C5 34 13 42 22 42 C26 42 26 38 29 37 C31 36 34 38 38 35 C42 32 43 27 43 22 C43 12 35 6 24 6 Z"
        fill="url(#tm-wood)"
        stroke="#78350f"
        strokeWidth="1"
      />
      {/* Thumbhole */}
      <ellipse cx="34" cy="28" rx="3.5" ry="4.5" fill="#0f172a" />
      {/* Glossy 3D Paint Dollops */}
      <circle cx="12" cy="18" r="3.5" fill="#ef4444" />
      <circle cx="11.2" cy="17" r="1.2" fill="#ffffff" opacity="0.65" />
      <circle cx="18" cy="12" r="3.5" fill="#3b82f6" />
      <circle cx="17.2" cy="11" r="1.2" fill="#ffffff" opacity="0.65" />
      <circle cx="27" cy="11" r="3.5" fill="#22c55e" />
      <circle cx="26.2" cy="10" r="1.2" fill="#ffffff" opacity="0.65" />
      <circle cx="35" cy="15" r="3.5" fill="#facc15" />
      <circle cx="34.2" cy="14" r="1.2" fill="#ffffff" opacity="0.65" />
      {/* Paintbrush laying across */}
      <g transform="rotate(35 24 24)">
        <rect x="23" y="4" width="2.5" height="28" rx="1.2" fill="#78350f" />
        <rect x="22.5" y="32" width="3.5" height="6" rx="0.8" fill="#e2e8f0" stroke="#64748b" strokeWidth="0.5" />
        <path d="M22.5 38 C22.5 41 24.2 43 24.2 43 C24.2 43 26 41 26 38 Z" fill="#d97706" />
      </g>
    </>
  ),

  // 10. QR: Luxury Acrylic Crystal Table Stand with Golden QR Matrix
  qr: (
    <>
      <defs>
        <linearGradient id="qr-base" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ca8a04" />
          <stop offset="50%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
        <linearGradient id="qr-acrylic" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      {/* Acrylic Block */}
      <rect x="8" y="5" width="32" height="34" rx="3" fill="url(#qr-acrylic)" stroke="#cbd5e1" strokeWidth="1" />
      {/* Beveled Top & Side Reflection */}
      <path d="M9 6 L39 6 L24 20 Z" fill="#ffffff" opacity="0.25" />
      {/* QR Corner Position Squares (Top Left, Top Right, Bottom Left) */}
      <rect x="12" y="9" width="7" height="7" rx="1" fill="#0f172a" />
      <rect x="13.5" y="10.5" width="4" height="4" fill="#ffffff" />
      <rect x="14.5" y="11.5" width="2" height="2" fill="#d97706" />

      <rect x="29" y="9" width="7" height="7" rx="1" fill="#0f172a" />
      <rect x="30.5" y="10.5" width="4" height="4" fill="#ffffff" />
      <rect x="31.5" y="11.5" width="2" height="2" fill="#d97706" />

      <rect x="12" y="26" width="7" height="7" rx="1" fill="#0f172a" />
      <rect x="13.5" y="27.5" width="4" height="4" fill="#ffffff" />
      <rect x="14.5" y="28.5" width="2" height="2" fill="#d97706" />

      {/* Internal QR Data Bits */}
      <rect x="22" y="10" width="3" height="3" fill="#0f172a" />
      <rect x="22" y="15" width="3" height="3" fill="#0f172a" />
      <rect x="12" y="18" width="3" height="3" fill="#0f172a" />
      <rect x="17" y="20" width="3" height="3" fill="#0f172a" />
      <rect x="22" y="22" width="4" height="4" rx="0.5" fill="#d97706" />
      <rect x="28" y="19" width="3" height="3" fill="#0f172a" />
      <rect x="33" y="19" width="3" height="3" fill="#0f172a" />
      <rect x="21" y="28" width="3" height="4" fill="#0f172a" />
      <rect x="28" y="25" width="4" height="3" fill="#0f172a" />
      <rect x="31" y="30" width="4" height="3" fill="#0f172a" />

      {/* Luminous Cyan Laser Scan Line across QR */}
      <line x1="8" y1="21" x2="40" y2="21" stroke="#00f2fe" strokeWidth="1.5" opacity="0.9" filter="drop-shadow(0 0 2px #00f2fe)" />

      {/* Heavy 24K Gold Brass Stand Base */}
      <path d="M5 38 L43 38 L41 43 L7 43 Z" fill="url(#qr-base)" />
      <rect x="4" y="42" width="40" height="2" rx="1" fill="#78350f" />
    </>
  ),

  // 11. DENETİM: Official Leather Audit Ledger with Quill & Seal
  denetim: (
    <>
      <defs>
        <linearGradient id="de-ledger" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>
        <linearGradient id="de-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
      {/* Clipboard / Folio Backing */}
      <rect x="8" y="6" width="32" height="37" rx="3.5" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
      {/* White Paper Sheet */}
      <rect x="11" y="10" width="26" height="30" rx="1.5" fill="url(#de-ledger)" />
      {/* Gold Top Binder Clip */}
      <rect x="17" y="4" width="14" height="7" rx="2" fill="url(#de-gold)" />
      <circle cx="24" cy="7.5" r="1.5" fill="#78350f" />
      {/* Document Text Lines */}
      <line x1="15" y1="17" x2="33" y2="17" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15" y1="22" x2="33" y2="22" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="15" y1="26" x2="28" y2="26" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="15" y1="30" x2="31" y2="30" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" />
      {/* Verified Green Shield Stamp */}
      <circle cx="29" cy="33" r="5" fill="#22c55e" />
      <path d="M27 33 L28.5 34.5 L31.5 31.5" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),

  // 12. YAZICI: High-End POS Thermal Receipt Printer
  yazici: (
    <>
      <defs>
        <linearGradient id="yz-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="50%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      {/* Fresh White Printed Receipt emerging from top */}
      <path d="M14 6 L34 6 L34 16 L14 16 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.8" />
      <line x1="17" y1="9" x2="31" y2="9" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" />
      <line x1="17" y1="12" x2="27" y2="12" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" />
      {/* Printer Chassis */}
      <rect x="6" y="14" width="36" height="26" rx="4" fill="url(#yz-body)" stroke="#475569" strokeWidth="1" />
      {/* Paper Feed Mouth */}
      <rect x="12" y="15" width="24" height="3" rx="1.2" fill="#020617" />
      {/* Front Bevel Plate */}
      <rect x="9" y="22" width="30" height="15" rx="2.5" fill="#1e293b" />
      {/* Status LED: Online Green Pulse */}
      <circle cx="15" cy="29.5" r="2" fill="#22c55e" />
      <circle cx="15" cy="29.5" r="3.2" fill="#22c55e" opacity="0.3" />
      {/* Feed Button */}
      <rect x="30" y="27" width="5" height="5" rx="1.5" fill="#475569" />
    </>
  ),

  // 13. ONLİNE: Holographic Real-Time Connected Users Radar Orb
  online: (
    <>
      <defs>
        <radialGradient id="on-radar" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0369a1" />
          <stop offset="70%" stopColor="#082f49" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
      </defs>
      {/* Radar Dish / Orb */}
      <circle cx="24" cy="24" r="19" fill="url(#on-radar)" stroke="#0284c7" strokeWidth="1.5" />
      {/* Concentric Grid Rings */}
      <circle cx="24" cy="24" r="13" fill="none" stroke="#0ea5e9" strokeWidth="0.8" opacity="0.5" />
      <circle cx="24" cy="24" r="7" fill="none" stroke="#0ea5e9" strokeWidth="0.8" opacity="0.5" />
      {/* Crosshairs */}
      <line x1="24" y1="5" x2="24" y2="43" stroke="#0ea5e9" strokeWidth="0.6" opacity="0.4" />
      <line x1="5" y1="24" x2="43" y2="24" stroke="#0ea5e9" strokeWidth="0.6" opacity="0.4" />
      {/* Sweeping Radar Beam */}
      <path d="M24 24 L39 12 A19 19 0 0 0 24 5 Z" fill="#38bdf8" opacity="0.3" />
      {/* Active User Blips */}
      <circle cx="31" cy="15" r="2.2" fill="#22c55e" />
      <circle cx="16" cy="29" r="2.2" fill="#22c55e" />
      <circle cx="29" cy="32" r="1.8" fill="#38bdf8" />
    </>
  ),

  // 14. EKİPLER: Collaborative Multi-Role Team Leadership Formation
  ekipler: (
    <>
      <defs>
        <linearGradient id="ek-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
      {/* Left Teammate (Emerald) */}
      <circle cx="14" cy="19" r="4.5" fill="#10b981" />
      <path d="M7 36 C7 30 10.5 28 14 28 C17.5 28 21 30 21 36 Z" fill="#047857" />
      {/* Right Teammate (Royal Blue) */}
      <circle cx="34" cy="19" r="4.5" fill="#3b82f6" />
      <path d="M27 36 C27 30 30.5 28 34 28 C37.5 28 41 30 41 36 Z" fill="#1d4ed8" />
      {/* Center Leader (Midnight & Gold Star) */}
      <circle cx="24" cy="14" r="5.5" fill="#f8fafc" />
      <path d="M15 38 C15 30 19 26 24 26 C29 26 33 30 33 38 Z" fill="#0f172a" stroke="url(#ek-gold)" strokeWidth="1" />
      <polygon points="24,6 25.5,9.5 29,10 26.5,12.5 27,16 24,14 21,16 21.5,12.5 19,10 22.5,9.5" fill="url(#ek-gold)" />
    </>
  ),

  // 15. SORU: Royal Blue Guide Book with Gold Compass Rose
  soru: (
    <>
      <defs>
        <linearGradient id="so-blue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
        <linearGradient id="so-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
      {/* Book Cover */}
      <rect x="8" y="6" width="32" height="36" rx="3.5" fill="url(#so-blue)" stroke="#60a5fa" strokeWidth="0.8" />
      {/* Gilded Page Edges on Right */}
      <rect x="36" y="9" width="3" height="30" fill="url(#so-gold)" opacity="0.8" />
      {/* Compass Rose / Guidance Emblem */}
      <circle cx="23" cy="24" r="10" fill="none" stroke="url(#so-gold)" strokeWidth="1.2" />
      {/* 4 Compass Points */}
      <polygon points="23,16 25,23 23,22 21,23" fill="url(#so-gold)" />
      <polygon points="23,32 25,25 23,26 21,25" fill="#ffffff" />
      <polygon points="15,24 22,22 21,24 22,26" fill="url(#so-gold)" />
      <polygon points="31,24 24,22 25,24 24,26" fill="#ffffff" />
    </>
  ),

  // 16. BİLGİ: Royal Jewel Medallion with Monogram
  bilgi: (
    <>
      <defs>
        <radialGradient id="bi-jewel" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </radialGradient>
        <linearGradient id="bi-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="19" fill="url(#bi-jewel)" stroke="url(#bi-gold)" strokeWidth="2.5" />
      {/* Crown above i */}
      <polygon points="24,10 25.5,12.5 28,12 26.5,14 27,16 24,15 21,16 21.5,14 20,12 22.5,12.5" fill="url(#bi-gold)" />
      {/* Letter 'i' */}
      <circle cx="24" cy="18.5" r="2.2" fill="#ffffff" />
      <rect x="22" y="23" width="4" height="11" rx="1.5" fill="#ffffff" />
    </>
  ),

  // 17. PENCERE: Windows XP Classic Worksheet Window
  pencere: (
    <>
      <defs>
        <linearGradient id="pc-title" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0055ea" />
          <stop offset="100%" stopColor="#0035a0" />
        </linearGradient>
      </defs>
      <rect x="6" y="7" width="36" height="34" rx="3" fill="#ffffff" stroke="#7f9db9" strokeWidth="1" />
      {/* Windows XP Royal Blue Titlebar */}
      <path d="M6 10 C6 8.3 7.3 7 9 7 L39 7 C40.7 7 42 8.3 42 10 L42 14 L6 14 Z" fill="url(#pc-title)" />
      <circle cx="39" cy="10.5" r="1.5" fill="#ef4444" />
      <circle cx="35" cy="10.5" r="1.5" fill="#3b82f6" />
      {/* Sheet Grid Rows */}
      <rect x="9" y="17" width="30" height="4" fill="#e0f2fe" />
      <line x1="9" y1="24" x2="39" y2="24" stroke="#e2e8f0" strokeWidth="1" />
      <line x1="9" y1="29" x2="39" y2="29" stroke="#e2e8f0" strokeWidth="1" />
      <line x1="9" y1="34" x2="39" y2="34" stroke="#e2e8f0" strokeWidth="1" />
      <line x1="19" y1="17" x2="19" y2="38" stroke="#cbd5e1" strokeWidth="1" />
      <line x1="29" y1="17" x2="29" y2="38" stroke="#cbd5e1" strokeWidth="1" />
    </>
  ),

  // 18. BAŞLAT: Royal Merit Crown Jewel Button Emblem
  baslat: (
    <>
      <defs>
        <radialGradient id="bs-glow" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0c4a6e" />
        </radialGradient>
        <linearGradient id="bs-crown" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="35%" stopColor="#fde047" />
          <stop offset="70%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>
      {/* Spherical Jewel Orb */}
      <circle cx="24" cy="24" r="18" fill="url(#bs-glow)" stroke="#bae6fd" strokeWidth="1.2" />
      <ellipse cx="24" cy="15" rx="11" ry="5" fill="#ffffff" opacity="0.35" />
      {/* 5-Point Imperial Crown */}
      <path
        d="M14 27 L13 20 L18 23 L21 16 L24 21 L27 16 L30 23 L35 20 L34 27 Z"
        fill="url(#bs-crown)"
      />
      <circle cx="13" cy="19" r="1.3" fill="url(#bs-crown)" />
      <circle cx="21" cy="15" r="1.5" fill="url(#bs-crown)" />
      <circle cx="24" cy="20" r="1.2" fill="url(#bs-crown)" />
      <circle cx="27" cy="15" r="1.5" fill="url(#bs-crown)" />
      <circle cx="35" cy="19" r="1.3" fill="url(#bs-crown)" />
      <rect x="13" y="27" width="22" height="3" rx="1" fill="url(#bs-crown)" />
      <circle cx="24" cy="28.5" r="1" fill="#ef4444" />
      <circle cx="18" cy="28.5" r="0.8" fill="#ffffff" />
      <circle cx="30" cy="28.5" r="0.8" fill="#ffffff" />
    </>
  ),

  // 19. UYARI: Glossy 3D Hazard Warning Triangle
  uyari: (
    <>
      <defs>
        <linearGradient id="uy-amber" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#eab308" />
        </linearGradient>
      </defs>
      <polygon points="24,6 44,40 4,40" fill="url(#uy-amber)" stroke="#b45309" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="22.5" y="18" width="3" height="12" rx="1.5" fill="#0f172a" />
      <circle cx="24" cy="34" r="2" fill="#0f172a" />
    </>
  ),

  // 20. RAPOR: 3D Analytics Report with Bar Chart and Luxury Shield
  rapor: (
    <>
      <defs>
        <linearGradient id="rp-doc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="rp-bar1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="rp-bar2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="rp-bar3" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <rect x="8" y="4" width="32" height="40" rx="4" fill="url(#rp-doc)" stroke="#94a3b8" strokeWidth="1.5" />
      <path d="M30 4 L40 14 L30 14 Z" fill="#cbd5e1" />
      <line x1="14" y1="12" x2="26" y2="12" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="17" x2="34" y2="17" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
      {/* Bars */}
      <rect x="14" y="28" width="4" height="10" rx="1" fill="url(#rp-bar1)" />
      <rect x="22" y="22" width="4" height="16" rx="1" fill="url(#rp-bar2)" />
      <rect x="30" y="25" width="4" height="13" rx="1" fill="url(#rp-bar3)" />
      <line x1="12" y1="39" x2="36" y2="39" stroke="#475569" strokeWidth="1.5" />
    </>
  ),
};

export function XpIcon({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <svg
      className="xp-icon"
      width={size}
      height={size}
      style={{
        width: `calc(${size}px * var(--xp-ui-scale, 1))`,
        height: `calc(${size}px * var(--xp-ui-scale, 1))`,
      }}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name] ?? GLYPHS.pencere}
    </svg>
  );
}
