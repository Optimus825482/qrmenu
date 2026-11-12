/**
 * Görev = the official F&B job title of a member of staff (a position in the hotel's hierarchy).
 * Rol = what the person may do in this system and which screens they get. A görev only *suggests* a
 * role. The live catalogue is the `job_titles` table (Kullanıcı Yönetimi > Görevler); this list is its
 * first draft: the same rows the migration inserts, and what the seed creates on a fresh database.
 */
export const JOB_DEPARTMENTS = ["YONETIM", "SERVIS", "BAR", "MUTFAK", "MINIBAR", "SISTEM", "DIGER"] as const;
export type JobDepartment = (typeof JOB_DEPARTMENTS)[number];

export const JOB_DEPARTMENT_LABELS: Record<JobDepartment, string> = {
  YONETIM: "F&B yönetimi",
  SERVIS: "Restoran ve servis",
  BAR: "Bar",
  MUTFAK: "Mutfak",
  MINIBAR: "Minibar takip",
  SISTEM: "Sistem ve BT",
  DIGER: "Diğer",
};

export interface JobTitleDef {
  code: string;
  name: string;
  department: JobDepartment;
  /** Code of the görev this one reports to; omitted at the top of a line. */
  parent?: string;
  /** Code of the role suggested when a user gets this görev. */
  role: string;
}

/** Parents always come before their children. */
export const JOB_TITLE_CATALOG: JobTitleDef[] = [
  { code: "G-OTM", name: "Otel Müdürü", department: "YONETIM", role: "R-OTM" },
  { code: "G-FBM", name: "F&B Müdürü", department: "YONETIM", parent: "G-OTM", role: "R-FBM" },
  { code: "G-FBA", name: "F&B Müdür Yardımcısı", department: "YONETIM", parent: "G-FBM", role: "R-FBY" },
  { code: "G-OSS", name: "Oda Servisi Sorumlusu", department: "YONETIM", parent: "G-FBA", role: "R-OSS" },
  { code: "G-SRM", name: "Servis Müdürü", department: "YONETIM", parent: "G-FBA", role: "R-OUY" },
  { code: "G-RSM", name: "Restoran Müdürü", department: "YONETIM", parent: "G-FBA", role: "R-OUY" },
  { code: "G-OUM", name: "Outlet Müdürü", department: "YONETIM", parent: "G-FBA", role: "R-OUY" },
  { code: "G-OUY", name: "Outlet Yöneticisi", department: "YONETIM", parent: "G-OUM", role: "R-OUY" },
  { code: "G-BRM", name: "Bar Müdürü", department: "YONETIM", parent: "G-FBA", role: "R-OUY" },
  { code: "G-QMY", name: "QR Menü Yöneticisi", department: "YONETIM", parent: "G-FBA", role: "R-QMY" },
  { code: "G-OUS", name: "Outlet Şefi", department: "SERVIS", parent: "G-OUM", role: "R-SGF" },
  { code: "G-RSS", name: "Restoran Şefi", department: "SERVIS", parent: "G-RSM", role: "R-SGF" },
  { code: "G-SSV", name: "Servis Süpervizörü", department: "SERVIS", parent: "G-SRM", role: "R-SGF" },
  { code: "G-SGF", name: "Şef Garson", department: "SERVIS", parent: "G-OUS", role: "R-SGF" },
  { code: "G-GAR", name: "Garson", department: "SERVIS", parent: "G-SGF", role: "R-GAR" },
  { code: "G-KOM", name: "Komi", department: "SERVIS", parent: "G-GAR", role: "R-GAR" },
  { code: "G-RUN", name: "Runner", department: "SERVIS", parent: "G-GAR", role: "R-GAR" },
  { code: "G-HOS", name: "Host / Hostes", department: "SERVIS", parent: "G-SGF", role: "R-OUT" },
  { code: "G-KAS", name: "Kasiyer", department: "SERVIS", parent: "G-OUM", role: "R-KAS" },
  { code: "G-ODS", name: "Oda Servisi Görevlisi", department: "SERVIS", parent: "G-OSS", role: "R-ODS" },
  { code: "G-BUT", name: "Butler (VIP)", department: "SERVIS", parent: "G-SRM", role: "R-BUT" },
  { code: "G-BAR", name: "Barmen / Barmaid", department: "BAR", parent: "G-BRM", role: "R-BAR" },
  { code: "G-BRS", name: "Barista", department: "BAR", parent: "G-BRM", role: "R-BAR" },
  { code: "G-MUS", name: "Mutfak Şefi", department: "MUTFAK", parent: "G-FBM", role: "R-MUS" },
  { code: "G-MUY", name: "Mutfak Yöneticisi", department: "MUTFAK", parent: "G-MUS", role: "R-MUY" },
  { code: "G-SOU", name: "Sous Chef", department: "MUTFAK", parent: "G-MUS", role: "R-MUS" },
  { code: "G-DCP", name: "Demi Chef de Partie", department: "MUTFAK", parent: "G-SOU", role: "R-MUP" },
  { code: "G-ASC", name: "Aşçı", department: "MUTFAK", parent: "G-SOU", role: "R-MUP" },
  { code: "G-PAS", name: "Pastacı", department: "MUTFAK", parent: "G-SOU", role: "R-MUP" },
  { code: "G-COM", name: "Commis / Aşçı Yardımcısı", department: "MUTFAK", parent: "G-ASC", role: "R-MUP" },
  { code: "G-MUP", name: "Mutfak Personeli", department: "MUTFAK", parent: "G-ASC", role: "R-MUP" },
  { code: "G-STW", name: "Steward / Bulaşıkhane Görevlisi", department: "MUTFAK", parent: "G-MUS", role: "R-MUP" },
  { code: "G-KDS", name: "KDS Operatörü", department: "MUTFAK", parent: "G-MUS", role: "R-KDS" },
  { code: "G-MTY", name: "Minibar Takip Yöneticisi", department: "MINIBAR", parent: "G-FBA", role: "R-MTY" },
  { code: "G-MTS", name: "Minibar Takip Süpervizör", department: "MINIBAR", parent: "G-MTY", role: "R-HKS" },
  { code: "G-MTD", name: "Minibar Takip Depo Sorumlusu", department: "MINIBAR", parent: "G-MTS", role: "R-DEP" },
  { code: "G-MTK", name: "Minibar Takip Kat Sorumlusu", department: "MINIBAR", parent: "G-MTS", role: "R-KAT" },
  { code: "G-MTO", name: "Minibar Takip Operasyonu", department: "MINIBAR", parent: "G-MTS", role: "R-KAT" },
  { code: "G-MGR", name: "Minibar Garson", department: "MINIBAR", parent: "G-MTK", role: "R-KAT" },
  { code: "G-SYS", name: "Sistem Yöneticisi", department: "SISTEM", role: "R-SYS" },
  { code: "G-ITT", name: "BT Destek Sorumlusu", department: "SISTEM", parent: "G-SYS", role: "R-ITT" },
];

export const USER_JOB_TITLES = JOB_TITLE_CATALOG.map((title) => title.name);

export type JobTitleNode = { id: string; name: string; parentId: string | null };

/**
 * Rows in reading order of the hierarchy: every görev directly under the one it reports to, with its
 * depth (0 = top of a line). Siblings keep the order they came in. A row whose parent is missing, or
 * that sits in a loop, is treated as a top-level row rather than dropped.
 */
export function orderJobTitles<T extends JobTitleNode>(rows: readonly T[]): (T & { depth: number })[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string | null, T[]>();
  for (const row of rows) {
    const parent = row.parentId && byId.has(row.parentId) && !reportsTo(rows, row.parentId, row.id) ? row.parentId : null;
    const list = children.get(parent);
    if (list) list.push(row);
    else children.set(parent, [row]);
  }
  const out: (T & { depth: number })[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const row of children.get(parent) ?? []) {
      out.push({ ...row, depth });
      visit(row.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

/** How a row of the hierarchy is drawn as a tree: the connector lines to its left. */
export type TreeLines = {
  /** One entry per level above the row's own connector: whether that ancestor's line runs on past this row. */
  guides: boolean[];
  /** Last görev under its parent: the connector ends here instead of running on down. */
  last: boolean;
};

/** Connector lines for rows already in hierarchy order (see orderJobTitles), by row id. */
export function treeLines(rows: readonly { id: string; depth: number }[]): Map<string, TreeLines> {
  const out = new Map<string, TreeLines>();
  rows.forEach((row, index) => {
    // A line at `level` runs on when the next row at that level or above is exactly at that level.
    const continues = (level: number) => {
      const next = rows.slice(index + 1).find((later) => later.depth <= level);
      return next !== undefined && next.depth === level;
    };
    const guides: boolean[] = [];
    for (let level = 1; level < row.depth; level++) guides.push(continues(level));
    out.set(row.id, { guides, last: !continues(row.depth) });
  });
  return out;
}

/** Whether `id` reports to `ancestorId`, directly or through the line above it (or is that görev itself). */
export function reportsTo(rows: readonly JobTitleNode[], id: string, ancestorId: string): boolean {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  let current: string | null = id;
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** A görev as the user forms offer it. */
export type JobTitleChoice = { id: string; name: string; department: string; depth: number; defaultRoleId: string | null };

/** Choices (already in hierarchy order) under their department headings, indented by rank inside each. */
export function groupJobTitleChoices<T extends JobTitleChoice>(choices: readonly T[]): { label: string; options: (T & { indent: number })[] }[] {
  const groups: { label: string; options: (T & { indent: number })[] }[] = [];
  for (const department of JOB_DEPARTMENTS) {
    const own = choices.filter((choice) => (JOB_DEPARTMENTS as readonly string[]).includes(choice.department) ? choice.department === department : department === "DIGER");
    if (own.length === 0) continue;
    const top = Math.min(...own.map((choice) => choice.depth));
    groups.push({ label: JOB_DEPARTMENT_LABELS[department], options: own.map((choice) => ({ ...choice, indent: choice.depth - top })) });
  }
  return groups;
}

/** Option text of a görev: non-breaking indentation shows who reports to whom. */
export const jobTitleOptionLabel = (choice: { name: string; indent: number }) => `${"\u00A0\u00A0\u00A0".repeat(Math.min(choice.indent, 6))}${choice.name}`;
