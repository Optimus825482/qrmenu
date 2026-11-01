"use client";

import { PriceDisplay } from "@/generated/prisma/enums";
import { useState } from "react";
import { updateOutletAreaSettingsAction } from "@/modules/core/server/admin/actions/outletAreas";
import type { OutletRow } from "@/modules/core/server/admin/outlets";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { PRICE_DISPLAY_LABELS } from "./values";

type Props = {
  outlet: OutletRow;
  areaId: string;
  setStatus(text: string): void;
  dialogOnly?: boolean;
  open?: boolean;
  onClose?: () => void;
};

export function OutletAreaPanel({ outlet, areaId, setStatus, dialogOnly = false, open, onClose }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const area = outlet.areas.find((item) => item.id === areaId);
  if (!area) return null;
  const canOrder = outlet.hasOrdering;
  const close = () => {
    setDialogOpen(false);
    onClose?.();
  };

  const submit = async (values: FormValues) => {
    const orderingEnabled = values.orderingEnabled === "OUTLET" ? null : values.orderingEnabled === "OPEN";
    const priceDisplay = values.priceDisplay === "INHERIT" ? null : values.priceDisplay;
    const result = await updateOutletAreaSettingsAction({
      outletId: outlet.id,
      id: area.id,
      data: { orderingEnabled, priceDisplay },
    });
    if (result.ok) setStatus(`${outlet.name} · ${area.name || area.type}: alan ayarları güncellendi`);
    return result;
  };

  return (
    <>
      {!dialogOnly ? (
        <section className="xp-defs-panel" aria-label={`${area.name || area.type} alanı`}>
          <header className="xp-defs-panel-heading">
            <h2>{outlet.name} · {area.name || area.type}</h2>
            <p>Bu alandaki masaların servis ve fiyat gösterimi</p>
          </header>
          <dl className="xp-defs-summary">
            <div><dt>Outlet</dt><dd>{outlet.name}</dd></div>
            <div><dt>Alan türü</dt><dd>{area.type === "ACIK" ? "Açık alan" : "Kapalı alan"}</dd></div>
            <div><dt>Masa</dt><dd>{area.tableCount}</dd></div>
            <div><dt>Servis</dt><dd>{!canOrder ? "Outlet sipariş almıyor" : area.orderingEnabled === null ? (outlet.orderingEnabled ? "Outlet ayarı kullanılıyor · Açık" : "Outlet ayarı kullanılıyor · Kapalı") : area.orderingEnabled ? "Açık" : "Kapalı"}</dd></div>
            <div><dt>Fiyat</dt><dd>{area.priceDisplay === null ? `Outlet ayarı · ${PRICE_DISPLAY_LABELS[outlet.priceDisplay]}` : PRICE_DISPLAY_LABELS[area.priceDisplay]}</dd></div>
          </dl>
          <button type="button" className="xp-button" onClick={() => setDialogOpen(true)}>Alan ayarlarını düzenle</button>
        </section>
      ) : null}
      <FormDialog
        title={`${area.name || area.type} alan ayarları`}
        open={dialogOnly ? open === true : dialogOpen}
        onClose={close}
        onSubmit={submit}
        submitText="Kaydet"
        confirmBeforeSubmit
      >
        <Field name="outletName" label="Outlet">
          <input type="text" value={outlet.name} readOnly />
        </Field>
        <Field name="areaName" label="Alan">
          <input type="text" value={area.name || (area.type === "ACIK" ? "Açık alan" : "Kapalı alan")} readOnly />
        </Field>
        <Field name="orderingEnabled" label="Servis durumu">
          <select defaultValue={area.orderingEnabled === null ? "OUTLET" : area.orderingEnabled ? "OPEN" : "CLOSED"}>
            <option value="OUTLET">Outlet ayarını kullan</option>
            <option value="OPEN">Bu alanda servis açık</option>
            <option value="CLOSED">Bu alanda servis kapalı</option>
          </select>
        </Field>
        <Field name="priceDisplay" label="Fiyat gösterimi">
          <select defaultValue={area.priceDisplay ?? "INHERIT"}>
            <option value="INHERIT">Outlet ayarını kullan</option>
            {Object.values(PriceDisplay).filter((value) => value !== "INHERIT").map((value) => (
              <option key={value} value={value}>{PRICE_DISPLAY_LABELS[value]}</option>
            ))}
          </select>
        </Field>
      </FormDialog>
    </>
  );
}
