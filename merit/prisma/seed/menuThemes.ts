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
];
