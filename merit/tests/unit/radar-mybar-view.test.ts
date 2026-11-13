import { describe, expect, it } from "vitest";
import { parseWallViews } from "@/modules/radar/constants";
import { initialState } from "@/modules/radar/state";
import { reduce } from "@/modules/radar/ui/reducers";
import { openMybarRequests, waitModel } from "@/modules/radar/ui/views/Mybar";
import { T0, deepFreeze, ev, makeSnapshot } from "../helpers/radarStateFixtures";

const fresh = () => deepFreeze(initialState(makeSnapshot()));
const MIN = 60_000;

describe("radar MyBar sekmesi", () => {
  it("açık talepler odadan türetilir: yeni talep onay bekler, görülünce onaylanır", () => {
    let s = reduce(fresh(), ev("mybar.opened", T0, { requestId: "m1", roomId: "r1" }));
    expect(openMybarRequests(s.layers.minibar!)).toMatchObject([{ requestId: "m1", roomNumber: "101", seen: false }]);
    s = reduce(s, ev("mybar.seen", T0 + 1, { requestId: "m1", roomId: "r1" }));
    expect(openMybarRequests(s.layers.minibar!)).toMatchObject([{ requestId: "m1", seen: true }]);
  });

  it("kapanan talep açık listeden çıkar, kapananlara oda numarası ve sonuçla girer; tekrar eden olay eklemez", () => {
    let s = reduce(fresh(), ev("mybar.opened", T0, { requestId: "m1", roomId: "r1" }));
    const closed = ev("mybar.closed", T0 + 5 * MIN, { requestId: "m1", roomId: "r1", outcome: "EKSIK" });
    s = reduce(s, closed);
    expect(openMybarRequests(s.layers.minibar!)).toEqual([]);
    expect(s.layers.minibar!.mybarClosed).toMatchObject([{ requestId: "m1", roomNumber: "101", outcome: "EKSIK" }]);
    expect(reduce(s, closed).layers.minibar!.mybarClosed).toHaveLength(1);
  });

  it("eski bir talebin geç kapanışı yeni talebi kapatmaz ve kapananlara girmez", () => {
    let s = reduce(fresh(), ev("mybar.opened", T0, { requestId: "m2", roomId: "r1" }));
    s = reduce(s, ev("mybar.closed", T0 + 1, { requestId: "m1", roomId: "r1", outcome: "TAMAM" }));
    expect(openMybarRequests(s.layers.minibar!)).toHaveLength(1);
    expect(s.layers.minibar!.mybarClosed ?? []).toEqual([]);
  });

  it("bekleme: sınırın %80'inde dikkat, sınırda gecikti", () => {
    const since = new Date(T0).toISOString();
    expect(waitModel(since, 10, T0 + 3 * MIN)).toMatchObject({ ageMin: 3, tone: "info" });
    expect(waitModel(since, 10, T0 + 8 * MIN)).toMatchObject({ tone: "warn", levelLabel: "Dikkat" });
    expect(waitModel(since, 10, T0 + 10 * MIN)).toMatchObject({ pct: 100, tone: "danger", levelLabel: "Gecikti" });
  });

  it("duvar ekranı görünümleri mybar adını tanır", () => {
    expect(parseWallViews("genel,mybar,yok")).toEqual(["genel", "mybar"]);
  });
});
