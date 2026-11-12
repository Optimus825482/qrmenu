// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterOptions, SearchSelect } from "@/components/ui/SearchSelect";

const OPTIONS = [
  { value: "1", label: "Beyaz Şeker 2 gr. (Sıcak İçecekler & Kahve)" },
  { value: "2", label: "Esmer Şeker 2 gr. (Sıcak İçecekler & Kahve)" },
  { value: "3", label: "Redbull 250 ml. (Soğuk İçecekler & Meşrubat)" },
  { value: "4", label: "İce Tea Limon 330 ml (Soğuk İçecekler & Meşrubat)" },
];

afterEach(cleanup);

describe("SearchSelect", () => {
  it("arama Türkçe harfe ve büyük-küçük harfe duyarsızdır, her kelimeyi arar", () => {
    expect(filterOptions(OPTIONS, "seker").map((o) => o.value)).toEqual(["1", "2"]);
    expect(filterOptions(OPTIONS, "ŞEKER esmer").map((o) => o.value)).toEqual(["2"]);
    expect(filterOptions(OPTIONS, "ice tea").map((o) => o.value)).toEqual(["4"]);
    expect(filterOptions(OPTIONS, "  ")).toHaveLength(4);
    expect(filterOptions(OPTIONS, "yok")).toHaveLength(0);
  });

  it("dokununca liste açılır, yazdıkça daralır, seçilen ürün bildirilir", () => {
    const onChange = vi.fn();
    render(<SearchSelect options={OPTIONS} value="" onChange={onChange} placeholder="Ürün yazın" ariaLabel="Eklenecek ürün" />);
    const input = screen.getByRole("combobox", { name: "Eklenecek ürün" });
    expect(input.getAttribute("type")).toBe("text");
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.focus(input);
    expect(screen.getAllByRole("option")).toHaveLength(4);
    fireEvent.change(input, { target: { value: "red" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.click(screen.getByRole("option"));
    expect(onChange).toHaveBeenCalledWith("3");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Enter ilk eşleşeni seçer; eşleşme yoksa bunu söyler; seçili ürünün adı kutuda görünür", () => {
    const onChange = vi.fn();
    render(<SearchSelect options={OPTIONS} value="2" onChange={onChange} placeholder="Ürün yazın" ariaLabel="Eklenecek ürün" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe(OPTIONS[1].label);
    fireEvent.focus(input);
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("Eşleşen ürün yok")).toBeTruthy();
    fireEvent.change(input, { target: { value: "beyaz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("1");
  });
});
