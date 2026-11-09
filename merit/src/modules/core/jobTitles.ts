/**
 * Hotel F&B job titles. The Merit Royal career post explicitly names Service Manager,
 * Bartender/Barmaid, Barista and Waiter; remaining entries are common hotel F&B roles.
 */
export const USER_JOB_TITLE_GROUPS = [
  {
    label: "F&B yönetimi",
    options: ["F&B Müdürü", "F&B Manager Assistant", "Servis Müdürü", "Restoran Müdürü", "Outlet Müdürü", "Outlet Şefi", "Bar Müdürü"],
  },
  {
    label: "Minibar Takip Operasyonu",
    options: [
      "Minibar Takip Operasyonu",
      "Minibar Takip Süpervizör",
      "Minibar Takip Depo Sorumlusu",
      "Minibar Takip Kat Sorumlusu",
    ],
  },
  {
    label: "Restoran ve servis",
    options: ["Restoran Şefi", "Şef Garson", "Servis Süpervizörü", "Garson", "Komi", "Runner", "Host / Hostes"],
  },
  {
    label: "Bar",
    options: ["Barmen / Barmaid", "Barista"],
  },
  {
    label: "Mutfak",
    options: ["Mutfak Şefi", "Sous Chef", "Aşçı", "Demi Chef de Partie", "Commis / Aşçı Yardımcısı", "Pastacı", "Mutfak Personeli", "Steward / Bulaşıkhane Görevlisi"],
  },
  {
    label: "Diğer F&B görevleri",
    options: ["Kasiyer", "Oda Servisi Görevlisi", "Butler (VIP)", "KDS Operatörü"],
  },
] as const;

export const USER_JOB_TITLES = USER_JOB_TITLE_GROUPS.flatMap((group) => group.options);
export const CUSTOM_JOB_TITLE = "__custom_job_title__";
