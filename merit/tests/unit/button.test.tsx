import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/Button";
import { DensityRoot } from "@/components/ui/Density";

describe("Button", () => {
  it("primary variant carries data-primary", () => {
    const html = renderToStaticMarkup(<Button variant="primary">Kaydet</Button>);
    expect(html).toContain("data-primary");
    expect(html).toContain("Kaydet");
  });

  it("secondary variant has no data-primary", () => {
    expect(renderToStaticMarkup(<Button>Vazgeç</Button>)).not.toContain("data-primary");
  });

  it("disabledReason shows the reason and wires aria", () => {
    const html = renderToStaticMarkup(<Button disabledReason="Havuz yetersiz">Gönder</Button>);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Havuz yetersiz");
    const id = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(new RegExp(`<small[^>]*id="${id}"[^>]*>Havuz yetersiz</small>|<small[^>]*>Havuz yetersiz</small>`));
  });

  it("without disabledReason there is no aria-disabled", () => {
    expect(renderToStaticMarkup(<Button>Tamam</Button>)).not.toContain("aria-disabled");
  });

  it("DensityRoot sets data-density", () => {
    const html = renderToStaticMarkup(
      <DensityRoot density="pos">
        <Button>Tamam</Button>
      </DensityRoot>,
    );
    expect(html).toContain('data-density="pos"');
  });
});
