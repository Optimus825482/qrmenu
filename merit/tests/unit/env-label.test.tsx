// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EnvLabel, EnvLabelProvider } from "@/components/EnvLabel";

afterEach(cleanup);

describe("EnvLabel (ENV_LABEL ortam rozeti)", () => {
  it("etiket doluysa rozet çizer ve metni içerir", () => {
    render(
      <EnvLabelProvider label="EĞİTİM">
        <EnvLabel />
      </EnvLabelProvider>,
    );
    const badge = screen.getByTestId("env-label");
    expect(badge.textContent).toBe("EĞİTİM");
    expect(badge.getAttribute("title")).toContain("gerçek veri değildir");
  });

  it.each([undefined, null, "", "   "])("etiket %j ise hiçbir şey çizmez", (label) => {
    const { container } = render(
      <EnvLabelProvider label={label}>
        <EnvLabel />
      </EnvLabelProvider>,
    );
    expect(screen.queryByTestId("env-label")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("sağlayıcı olmadan da çökmeden boş kalır", () => {
    const { container } = render(<EnvLabel />);
    expect(container.innerHTML).toBe("");
  });

  it("anlamsal renk belirteçleri kullanır (sabit renk yok)", () => {
    render(
      <EnvLabelProvider label="EĞİTİM">
        <EnvLabel />
      </EnvLabelProvider>,
    );
    const style = screen.getByTestId("env-label").getAttribute("style") ?? "";
    expect(style).toContain("var(--warn)");
    expect(style).toContain("var(--warn-bg)");
    expect(style).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
