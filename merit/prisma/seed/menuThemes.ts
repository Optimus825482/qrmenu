export interface MenuThemeDef {
  name: string;
  bg: string;
  accent: string;
  soft: string;
  textOnAccent: string;
  isDefault?: boolean;
}

/** Built-in guest menu themes. Created when missing (by name); an operator's edits are never overwritten. */
export const MENU_THEMES: MenuThemeDef[] = [
  { name: "Royal Gold", bg: "#0f0d0a", accent: "#c9a24a", soft: "#1d1a14", textOnAccent: "#0f0d0a", isDefault: true },
  { name: "Deniz", bg: "#f6fbff", accent: "#0a6ea8", soft: "#e3f1fa", textOnAccent: "#ffffff" },
  { name: "Zeytin", bg: "#fbfaf5", accent: "#5a6b2f", soft: "#eef0e3", textOnAccent: "#ffffff" },
  { name: "Krem", bg: "#faf6ee", accent: "#8a5a2b", soft: "#f1e9da", textOnAccent: "#ffffff" },
  { name: "Koyu Lüks", bg: "#16181d", accent: "#c8855a", soft: "#23262d", textOnAccent: "#16181d" },
  { name: "Zümrüt & Altın", bg: "#061712", accent: "#d4af37", soft: "#0d2b22", textOnAccent: "#061712" },
  { name: "Safir Gece", bg: "#081124", accent: "#48cae4", soft: "#101d3b", textOnAccent: "#081124" },
  { name: "Gül Kurusu & Şampanya", bg: "#1c1214", accent: "#e8b4a2", soft: "#2b1b1e", textOnAccent: "#1c1214" },
  { name: "Terracotta & Kumsal", bg: "#1a110d", accent: "#f08a5d", soft: "#291b15", textOnAccent: "#1a110d" },
  { name: "Mermer & Platin", bg: "#121316", accent: "#d0d4dc", soft: "#1e2025", textOnAccent: "#121316" },
  { name: "Lavanta & Ayışığı", bg: "#12101b", accent: "#c4b5fd", soft: "#1d192c", textOnAccent: "#12101b" },
  { name: "Bordo & Venedik", bg: "#180a0e", accent: "#dfa851", soft: "#2a1218", textOnAccent: "#180a0e" },
  { name: "Aman Zen Slate", bg: "#141517", accent: "#d4cfbe", soft: "#222429", textOnAccent: "#141517" },
  { name: "Four Seasons Fildişi", bg: "#faf8f5", accent: "#785028", soft: "#f0ebe1", textOnAccent: "#ffffff" },
  { name: "Capri Limoncello", bg: "#fffdfa", accent: "#a06000", soft: "#fbf3dd", textOnAccent: "#ffffff" },
  { name: "St. Moritz Chalet", bg: "#0f1713", accent: "#cba36b", soft: "#1c2b22", textOnAccent: "#0f1713" },
  { name: "Caviar & Deniz İncisi", bg: "#0a121e", accent: "#7ec8e3", soft: "#142236", textOnAccent: "#0a121e" },
  { name: "Monaco Grand Prix", bg: "#120c10", accent: "#f05454", soft: "#26141e", textOnAccent: "#120c10" },
  // Açık, Ferah & Gün Işığı Temaları (Light & Airy)
  { name: "Akdeniz Beyazı & Turkuaz", bg: "#f8fcff", accent: "#006994", soft: "#e6f4fa", textOnAccent: "#ffffff" },
  { name: "Sahil Kumu & Mercan", bg: "#fffaf4", accent: "#b84326", soft: "#f7ede1", textOnAccent: "#ffffff" },
  { name: "Pudra & Gül Bahçesi", bg: "#fff8f9", accent: "#9e3a58", soft: "#f8eaee", textOnAccent: "#ffffff" },
  { name: "Fildişi & Altın Zarafet", bg: "#fdfbf7", accent: "#8c6218", soft: "#f4eee1", textOnAccent: "#ffffff" },
  { name: "Adaçayı & Botanik", bg: "#f7fbf8", accent: "#2d6a4f", soft: "#e6f2ea", textOnAccent: "#ffffff" },
  { name: "Santorini Mavi & Beyaz", bg: "#ffffff", accent: "#124e96", soft: "#edf4fc", textOnAccent: "#ffffff" },
  { name: "Şampanya & Kaşmir", bg: "#fcf9f2", accent: "#7c5832", soft: "#f2eadb", textOnAccent: "#ffffff" },
  { name: "Lavanta & Sabah Çiyi", bg: "#faf8ff", accent: "#5b3e96", soft: "#eee9fa", textOnAccent: "#ffffff" },
  { name: "Narenciye & Güneş", bg: "#fffdf6", accent: "#a84b00", soft: "#faefd8", textOnAccent: "#ffffff" },
  { name: "İskandinav Keten & Taş", bg: "#f9f9f7", accent: "#3d4f58", soft: "#ecece7", textOnAccent: "#ffffff" },
  { name: "Ege İncisi & Mercan", bg: "#f5fbfc", accent: "#0d6973", soft: "#e1f1f4", textOnAccent: "#ffffff" },
  { name: "Porselen & Safir", bg: "#f9fbff", accent: "#1e3f7a", soft: "#eaeff8", textOnAccent: "#ffffff" },
];
