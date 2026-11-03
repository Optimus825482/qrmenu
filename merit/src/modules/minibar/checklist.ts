/**
 * Room checklist rule (pure, shared by the definitions preview and the floor attendant's room check):
 * an in-cabinet setup repeats once per cabinet (at least once), an out-of-cabinet setup appears once.
 */
export type ChecklistEntry = {
  setupId: string;
  setupName: string;
  /** Legacy label: "{name} - Dolap {n}" for in-cabinet setups, "{name}" otherwise. */
  label: string;
  /** 1-based cabinet number; null for out-of-cabinet setups. */
  cabinetNo: number | null;
  copy: number;
  copies: number;
};

export type ChecklistSetup = { id: string; name: string; isInsideCabinet: boolean };

const byName = (a: ChecklistSetup, b: ChecklistSetup) => a.name.localeCompare(b.name, "tr");

export function buildChecklist(roomType: { cabinetCount: number }, setups: ChecklistSetup[]): ChecklistEntry[] {
  const copies = Math.max(Math.trunc(roomType.cabinetCount) || 0, 1);
  const inside = setups.filter((s) => s.isInsideCabinet).sort(byName);
  const outside = setups.filter((s) => !s.isInsideCabinet).sort(byName);
  const entries: ChecklistEntry[] = [];
  for (const setup of inside) {
    for (let n = 1; n <= copies; n++) {
      entries.push({
        setupId: setup.id,
        setupName: setup.name,
        label: `${setup.name} - Dolap ${n}`,
        cabinetNo: n,
        copy: n,
        copies,
      });
    }
  }
  for (const setup of outside) {
    entries.push({ setupId: setup.id, setupName: setup.name, label: setup.name, cabinetNo: null, copy: 1, copies: 1 });
  }
  return entries;
}
