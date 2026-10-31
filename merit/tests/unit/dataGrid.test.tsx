// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";

type Row = { id: string; name: string; floor: number };

const ROWS: Row[] = [
  { id: "a", name: "Oda 101", floor: 1 },
  { id: "b", name: "Oda 102", floor: 1 },
  { id: "c", name: "Oda 201", floor: 2 },
];

const COLUMNS: Column<Row>[] = [
  { key: "name", title: "Ad", sortable: true },
  { key: "floor", title: "Kat", width: 60, render: (r) => `${r.floor}. kat` },
];

afterEach(cleanup);

function setup(over: Partial<Parameters<typeof DataGrid<Row>>[0]> = {}) {
  const mocks = {
    onPage: vi.fn(),
    onSort: vi.fn(),
    onSearch: vi.fn(),
    onSelect: vi.fn(),
  };
  render(
    <DataGrid<Row>
      columns={COLUMNS}
      rows={ROWS}
      total={3}
      page={1}
      pageSize={20}
      emptyText="Kayıt yok"
      {...mocks}
      {...over}
    />,
  );
  return mocks;
}

describe("DataGrid", () => {
  it("3 satır ve başlıkları render eder; role=grid, hücre render fonksiyonu çalışır", () => {
    setup();
    expect(screen.getByRole("grid")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(4); // başlık + 3 satır
    expect(screen.getByRole("columnheader", { name: /Ad/ })).toBeTruthy();
    expect(screen.getByText("Oda 102")).toBeTruthy();
    expect(screen.getByText("2. kat")).toBeTruthy();
  });

  it("satıra tık onSelect çağırır; seçili satır aria-selected olur", () => {
    const props = setup({ selectedId: "b" });
    fireEvent.click(screen.getByText("Oda 201"));
    expect(props.onSelect).toHaveBeenCalledWith(ROWS[2]);
    const selected = screen
      .getAllByRole("row")
      .filter((r) => r.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("Oda 102");
  });

  it("↓ seçimi ilerletir, Home/End uçlara gider; ilk satırda ↑ bir şey yapmaz", () => {
    const onSelect = vi.fn();
    function Harness() {
      const [id, setId] = useState<string | undefined>("a");
      return (
        <DataGrid<Row>
          columns={COLUMNS}
          rows={ROWS}
          total={3}
          page={1}
          pageSize={20}
          onPage={vi.fn()}
          onSort={vi.fn()}
          onSearch={vi.fn()}
          selectedId={id}
          onSelect={(row) => {
            onSelect(row);
            setId(row.id);
          }}
          emptyText="Kayıt yok"
        />
      );
    }
    render(<Harness />);
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith(ROWS[1]);
    expect(grid.getAttribute("aria-activedescendant")).toMatch(/row-b$/);
    fireEvent.keyDown(grid, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith(ROWS[2]);
    fireEvent.keyDown(grid, { key: "ArrowDown" }); // son satır: sınırda kalır
    expect(onSelect).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(grid, { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith(ROWS[0]);
    onSelect.mockClear();
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    expect(onSelect).not.toHaveBeenCalled(); // zaten ilk satır
  });

  it("↑ bir önceki satırı seçer", () => {
    const props = setup({ selectedId: "c" });
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowUp" });
    expect(props.onSelect).toHaveBeenCalledWith(ROWS[1]);
  });

  it("seçim yokken ↓ ilk satırı seçer", () => {
    const props = setup();
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" });
    expect(props.onSelect).toHaveBeenCalledWith(ROWS[0]);
  });

  it("Enter ve çift tık onActivate çağırır", () => {
    const onActivate = vi.fn();
    setup({ selectedId: "c", onActivate });
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith(ROWS[2]);
    fireEvent.doubleClick(screen.getByText("Oda 101"));
    expect(onActivate).toHaveBeenLastCalledWith(ROWS[0]);
  });

  it("boş liste emptyText gösterir", () => {
    setup({ rows: [], total: 0 });
    expect(screen.getByText("Kayıt yok")).toBeTruthy();
    expect(screen.queryAllByRole("row")).toHaveLength(1); // yalnız başlık
  });

  it("sıralanabilir başlığa tık onSort çağırır, ikinci tık yönü çevirir", () => {
    const props = setup({ sort: { field: "name", dir: "asc" } });
    fireEvent.click(screen.getByRole("columnheader", { name: /Ad/ }));
    expect(props.onSort).toHaveBeenLastCalledWith({ field: "name", dir: "desc" });
    props.onSort.mockClear();
    fireEvent.click(screen.getByRole("columnheader", { name: /Kat/ })); // sıralanamaz sütun
    expect(props.onSort).not.toHaveBeenCalled();
  });

  it("sıralanabilir başlık klavyeyle erişilir: tabIndex=0, Enter/Boşluk sıralar; sıralanamaz başlık odaklanamaz", () => {
    const props = setup({ sort: { field: "name", dir: "desc" } });
    const sortable = screen.getByRole("columnheader", { name: /Ad/ });
    expect(sortable.getAttribute("tabindex")).toBe("0");
    expect(sortable.getAttribute("aria-sort")).toBe("descending");
    fireEvent.keyDown(sortable, { key: "Enter" });
    expect(props.onSort).toHaveBeenLastCalledWith({ field: "name", dir: "asc" });
    fireEvent.keyDown(sortable, { key: " " });
    expect(props.onSort).toHaveBeenCalledTimes(2);
    const plain = screen.getByRole("columnheader", { name: /Kat/ });
    expect(plain.getAttribute("tabindex")).toBeNull();
    fireEvent.keyDown(plain, { key: "Enter" });
    expect(props.onSort).toHaveBeenCalledTimes(2);
  });

  it("sayfalama: sonraki/önceki sayfa onPage çağırır", () => {
    const props = setup({ total: 45, page: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Sonraki sayfa" }));
    expect(props.onPage).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Önceki sayfa" }));
    expect(props.onPage).toHaveBeenLastCalledWith(1);
  });

  it("sayfalama sınırı: ilk sayfada Önceki, son sayfada Sonraki pasiftir", () => {
    setup({ total: 45, page: 1 });
    expect((screen.getByRole("button", { name: "Önceki sayfa" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    cleanup();
    setup({ total: 45, page: 3 });
    expect((screen.getByRole("button", { name: "Sonraki sayfa" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("arama kutusu onSearch çağırır; toolbar yuvası render edilir", () => {
    const props = setup({ toolbar: <button type="button">Özel</button> });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "201" } });
    expect(props.onSearch).toHaveBeenLastCalledWith("201");
    expect(screen.getByRole("button", { name: "Özel" })).toBeTruthy();
  });

  it("başlığa fare tıkından sonra odak tabloda: ↓ seçimi ilerletir", () => {
    const props = setup({ selectedId: "a", sort: { field: "name", dir: "asc" } });
    const header = screen.getByRole("columnheader", { name: /Ad/ });
    header.focus(); // gerçek tarayıcıda tık başlığa odaklar
    fireEvent.click(header);
    expect(document.activeElement).toBe(screen.getByRole("grid"));
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(props.onSelect).toHaveBeenCalledWith(ROWS[1]);
  });

  it("başlıkta Enter ile sıralama odağı başlıkta bırakır", () => {
    setup();
    const header = screen.getByRole("columnheader", { name: /Ad/ });
    header.focus();
    fireEvent.keyDown(header, { key: "Enter" });
    expect(document.activeElement).toBe(header);
  });
});
