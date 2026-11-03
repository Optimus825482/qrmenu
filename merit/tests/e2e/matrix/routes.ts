import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "../e2eDb";
import { login } from "../fixtures";
import type { Tier } from "./a11y";

/** `ready`: text that proves the screen finished loading (SSE keeps the network from ever idling). */
export type RouteEntry = { key: string; path: string; user: string; outlet?: RegExp; tier: Tier; ready: RegExp };

/** Screens covered by the UX matrix. Every UX task adds the routes it touches. */
export const ROUTE_MATRIX: RouteEntry[] = [
  { key: "kat", path: "/kat", user: "kat.mr", tier: "personel", ready: /Günlük Minibar Kontrol/ },
  { key: "kat-oda-kontrol", path: "FIRST_ROOM", user: "kat.mr", tier: "personel", ready: /Hepsini Doldur/ },
  { key: "erisimim", path: "/erisimim", user: "kat.mr", tier: "personel", ready: /Erişimim/ },
  { key: "kat-dnd", path: "/kat/dnd", user: "kat.mr", tier: "personel", ready: /Rahatsız Etmeyin/ },
  { key: "depo-gorevler", path: "/depo/gorevler", user: "depo.cok", outlet: /Minibar/, tier: "personel", ready: /Görev izleme/ },
  { key: "depo-stok", path: "/depo/stok", user: "depo.cok", outlet: /Minibar/, tier: "personel", ready: /Zimmet Takibi/ },
  { key: "garson", path: "/garson", user: "garson.havuz", outlet: /Havuz Bar/, tier: "personel", ready: /Outlet Masaları/ },
  { key: "garson-cagrilar", path: "/garson/cagrilar", user: "garson.havuz", outlet: /Havuz Bar/, tier: "personel", ready: /Açık çağrı yok/ },
  { key: "kasa", path: "/kasa", user: "kasa.havuz", outlet: /Havuz Bar/, tier: "pos", ready: /Dokunmatik Kasa/ },
  { key: "kasa-yazici", path: "/kasa/yazici", user: "kasa.havuz", outlet: /Havuz Bar/, tier: "pos", ready: /Fiş Yazıcı Kuyruğu/ },
  { key: "kasa-iptal", path: "/kasa/iptal", user: "kasa.havuz", outlet: /Havuz Bar/, tier: "pos", ready: /Sipariş iptali/ },
  { key: "kds", path: "/kds", user: "kds.havuz", outlet: /Havuz Bar/, tier: "pos", ready: /Mutfak ekranı/ },
  { key: "oda-servisi", path: "/oda-servisi", user: "fbm.mr", tier: "personel", ready: /Operasyon Paneli/ },
  { key: "admin", path: "/admin", user: "admin", tier: "xp", ready: /Komuta Merkezi|Genel Durum/ },
];

/**
 * Id of the first room of the e2e database (the room-control page is addressed by id). The e2e seed
 * has no rooms, so the matrix adds one floor, one room type with a three-product minibar setup and
 * one room to the ROYAL hotel on first use.
 */
export async function firstRoomId(): Promise<string> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const existing = await client.query<{ id: string }>("SELECT id FROM rooms ORDER BY number LIMIT 1");
    if (existing.rows[0]) return existing.rows[0].id;
    const hotel = (await client.query<{ id: string }>("SELECT id FROM hotels WHERE code = 'ROYAL'")).rows[0].id;
    const [floorId, typeId, roomId, groupId, setupId] = [1, 2, 3, 4, 5].map(() => randomUUID());
    const now = "now()";
    await client.query(
      `INSERT INTO floors (id, hotel_id, number, name, is_active, created_at, updated_at) VALUES ($1, $2, 1, '1. Kat', true, ${now}, ${now})`,
      [floorId, hotel],
    );
    await client.query(
      `INSERT INTO room_types (id, hotel_id, name, cabinet_count, is_active, created_at, updated_at) VALUES ($1, $2, 'Standart Oda', 1, true, ${now}, ${now})`,
      [typeId, hotel],
    );
    await client.query(
      `INSERT INTO rooms (id, hotel_id, floor_id, room_type_id, number, capacity, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, '101', 2, true, ${now}, ${now})`,
      [roomId, hotel, floorId, typeId],
    );
    await client.query(`INSERT INTO product_groups (id, name, is_active, created_at, updated_at) VALUES ($1, 'Matris Grubu', true, ${now}, ${now})`, [groupId]);
    await client.query(`INSERT INTO setups (id, name, is_inside_cabinet, is_active, created_at, updated_at) VALUES ($1, 'Matris Setup', true, true, ${now}, ${now})`, [setupId]);
    for (const [i, name] of ["Su", "Kola", "Fıstık"].entries()) {
      const productId = randomUUID();
      await client.query(
        `INSERT INTO products (id, group_id, code, name, unit, critical_level, sale_price, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, 'Adet', 10, 50, true, ${now}, ${now})`,
        [productId, groupId, `MTR-${i}`, name],
      );
      await client.query(
        `INSERT INTO setup_items (id, setup_id, product_id, qty, created_at, updated_at) VALUES ($1, $2, $3, 2, ${now}, ${now})`,
        [randomUUID(), setupId, productId],
      );
    }
    await client.query(`INSERT INTO room_type_setups (hotel_id, room_type_id, setup_id, created_at) VALUES ($1, $2, $3, ${now})`, [hotel, typeId, setupId]);
    return roomId;
  } finally {
    await client.end();
  }
}

export async function openFirstRoom(page: Page): Promise<void> {
  await page.goto(`/kat/oda-kontrol/${await firstRoomId()}`);
}

/** Logs `entry.user` in, picks the outlet when asked to, and opens the route. */
export async function openRoute(page: Page, entry: RouteEntry): Promise<void> {
  await login(page, entry.user);
  // Field users pick their outlet on the login page itself; everyone else leaves /giris.
  if (entry.outlet) await page.getByRole("button", { name: entry.outlet }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"));
  if (entry.path === "FIRST_ROOM") await openFirstRoom(page);
  else await page.goto(entry.path);
  await expect(page).not.toHaveURL(/\/giris/);
  await expect(page.getByText(entry.ready).first()).toBeVisible({ timeout: 20_000 });
}
