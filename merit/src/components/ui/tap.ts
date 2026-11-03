/** Touch-target scale (spec 5.2). Pixel values mirror the `--tap-*` tokens in globals.css. */
export type Density = "xp" | "personel" | "pos";

export const TAP = { xp: 24, min: 44, std: 48, pri: 56, pos: 64 } as const;

export type TapRole = "action" | "primary" | "icon";

const TABLE: Record<Density, Record<TapRole, number>> = {
  xp: { action: TAP.xp, primary: TAP.xp, icon: TAP.xp },
  personel: { action: TAP.std, primary: TAP.pri, icon: TAP.std },
  pos: { action: TAP.pri, primary: TAP.pos, icon: TAP.pri },
};

export function tapFor(density: Density, role: TapRole): number {
  return TABLE[density][role];
}
