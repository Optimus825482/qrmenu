import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { runJob } from "../helpers/runJob";
import { makeOccupancyFiles, makeP4001File } from "../../fixtures/occupancy/make-occupancy";
import { count, seedMinibar, signIn, sql, today, upload } from "./helpers/minibar";

test.describe("@kabul-6 Doluluk yükleme, görevler ve öncelik planı", () => {
  test("üç dosya, tanımsız oda, UPSERT ve dört öncelik; ham dosyalar beş gün sonra temizlenir", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    seedMinibar();
    const depo = await signIn(browser, baseURL!, "depo.mr");
    const kat = await signIn(browser, baseURL!, "kat.mr");
    const dir = await mkdtemp(path.join(os.tmpdir(), "merit-k06-"));
    try {
      const files = await makeOccupancyFiles(today(), dir);
      for (const [file, kind, okRows, errorRows] of [[files.inhouse, "IN_HOUSE", 1, 1], [files.arrivals, "ARRIVAL", 2, 0], [files.departures, "DEPARTURE", 2, 0]] as const) {
        const preview = await upload(depo, file, kind, true);
        expect(preview.status(), await preview.text()).toBe(200);
        const body = await preview.json();
        expect(body).toMatchObject({ okRows, errorRows, detectedKind: kind });
        if (errorRows) { expect(body.unknownRooms).toEqual(["9999"]); expect(body.errors[0].message).toContain("9999"); }
        expect(await count("SELECT count(*) AS n FROM occupancy_uploads WHERE kind=$1", [kind])).toBe(0);
        const committed = await upload(depo, file, kind);
        expect(committed.status(), await committed.text()).toBe(200);
        expect(await committed.json()).toMatchObject({ okRows, errorRows, tasksGenerated: kind === "DEPARTURE" });
      }
      expect(await count("SELECT count(*) AS n FROM daily_tasks")).toBe(3);
      expect(await count("SELECT count(*) AS n FROM daily_task_items")).toBe(5);
      expect(await count("SELECT count(*) AS n FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.username='kat.mr' AND n.type='task.generated'")).toBeGreaterThan(0);
      const priority = await kat.request.get("/api/minibar/priority-plan");
      expect(priority.status()).toBe(200);
      const plan = await priority.json();
      expect(plan.entries.map((entry: {roomNumber: string; rank: number}) => [entry.roomNumber, entry.rank])).toEqual([["101",1],["102",2],["103",3],["104",4]]);
      expect(plan.entries[0].clash).toMatchObject({ departure: "11:00", arrival: "13:00", gapMin: 120, critical: true });
      expect(plan.entries[1].label).toContain("15 dk önce hazır");
      expect(plan.entries[2].label).toContain("1 saat içinde kontrol");
      const before = await count("SELECT count(*) AS n FROM guest_records");
      expect((await upload(depo, files.inhouse, "IN_HOUSE")).status()).toBe(200);
      expect(await count("SELECT count(*) AS n FROM guest_records")).toBe(before);
      expect(await count("SELECT count(*) AS n FROM daily_task_items")).toBe(5);
      const p4001 = await upload(depo, await makeP4001File(today(), dir), "IN_HOUSE", true);
      expect(p4001.status(), await p4001.text()).toBe(200);
      expect(await p4001.json()).toMatchObject({ format: "P4001", okRows: 1, errorRows: 0 });
      const stored = await sql<{ stored_path: string }>("SELECT stored_path FROM occupancy_uploads WHERE stored_path IS NOT NULL");
      expect(stored.length).toBe(4);
      const paths = stored.map(row => path.resolve(process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads"), row.stored_path));
      for (const file of paths) expect(existsSync(file), `ham dosya mevcut: ${path.basename(file)}`).toBe(true);
      const result = runJob("occupancy.cleanup", new Date(Date.now() + 5 * 86_400_000));
      expect(result).toEqual({ removed: 4, failed: 0 });
      for (const file of paths) expect(existsSync(file), `ham dosya temizlendi: ${path.basename(file)}`).toBe(false);
      expect(await count("SELECT count(*) AS n FROM occupancy_uploads WHERE stored_path IS NOT NULL")).toBe(0);
      expect(await count("SELECT count(*) AS n FROM guest_records")).toBe(before);
    } finally { await Promise.all([depo.close(), kat.close(), rm(dir, { recursive: true, force: true })]); }
  });
});
