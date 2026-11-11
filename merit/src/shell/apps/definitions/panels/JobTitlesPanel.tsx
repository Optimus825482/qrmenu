"use client";

import { useEffect, useState } from "react";
import {
  createJobTitleAction,
  deleteJobTitleAction,
  jobTitleOptionsAction,
  listJobTitlesAction,
  updateJobTitleAction,
} from "@/modules/core/server/admin/actions/jobTitles";
import type { JobTitleOptions, JobTitleRow } from "@/modules/core/server/admin/jobTitles";
import { JOB_DEPARTMENT_LABELS, JOB_DEPARTMENTS, reportsTo } from "@/modules/core/jobTitles";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { numberOrUndefined } from "./values";

type Props = { setStatus(text: string): void };
type Dialog = { mode: "new"; parentId?: string } | { mode: "edit"; row: JobTitleRow } | null;

const COLUMNS: Column<JobTitleRow>[] = [
  {
    key: "name",
    title: "Görev",
    render: (row) => (
      <span style={{ paddingLeft: row.depth * 16, opacity: row.isActive ? 1 : 0.55 }}>
        {row.depth > 0 ? "└ " : ""}
        {row.name}
        {row.isActive ? "" : " (pasif)"}
      </span>
    ),
  },
  { key: "department", title: "Bölüm", width: 130, render: (row) => JOB_DEPARTMENT_LABELS[row.department] },
  { key: "parentName", title: "Bağlı olduğu görev", width: 190, render: (row) => row.parentName ?? "—" },
  {
    key: "defaultRoleName",
    title: "Önerilen rol",
    width: 210,
    render: (row) => (row.defaultRoleName ? `${row.defaultRoleName} (${row.defaultRoleCode})` : "—"),
  },
  { key: "userCount", title: "Kullanıcı", width: 70, render: (row) => String(row.userCount) },
];

/**
 * Görevler: the hotel's official F&B job titles in reporting order. A görev gives no permission by
 * itself; it suggests the role a user with that title gets. Only SISTEM roles edit the catalogue.
 */
export function JobTitlesPanel({ setStatus }: Props) {
  const list = useLiveList<JobTitleRow>((query) => listJobTitlesAction(query), { entities: ["jobTitle", "role", "user"] });
  const [options, setOptions] = useState<JobTitleOptions | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const selected = list.rows.find((r) => r.id === selectedId);
  const canEdit = options?.canEdit === true;

  useEffect(() => {
    setStatus(`${list.total} görev${canEdit ? "" : " (salt okunur)"}`);
  }, [list.total, canEdit, setStatus]);

  useEffect(() => {
    let live = true;
    void jobTitleOptionsAction().then((result) => {
      if (live && result.ok) setOptions(result.data);
    });
    return () => {
      live = false;
    };
  }, []);

  const editing = dialog?.mode === "edit" ? dialog.row : undefined;
  const startParent = dialog?.mode === "new" ? dialog.parentId : undefined;
  // A görev cannot report to itself or to anything below it.
  const parentChoices = list.rows.filter((row) => !editing || !reportsTo(list.rows, row.id, editing.id));

  const submit = async (values: FormValues) => {
    const order = numberOrUndefined(values.sortOrder);
    const data = {
      name: values.name ?? "",
      department: values.department,
      parentId: values.parentId || undefined,
      defaultRoleId: values.defaultRoleId || undefined,
      sortOrder: values.sortOrder?.trim() && order === undefined ? Number.NaN : order,
      isActive: values.isActive !== undefined,
    };
    const result = editing ? await updateJobTitleAction({ id: editing.id, data }) : await createJobTitleAction({ data });
    if (result.ok) {
      setSelectedId(result.data.id);
      list.reload();
    }
    return result;
  };

  const remove = async (row: JobTitleRow) => {
    const yes = await confirm({
      title: "Görevi sil",
      message: `“${row.name}” görevi silinsin mi? Kullanıcısı olan görev silinemez; altındaki görevler bir üst göreve bağlanır.`,
      danger: true,
      confirmLabel: "Sil",
    });
    if (!yes) return;
    const result = await deleteJobTitleAction({ id: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Görev silinemedi" });
      return;
    }
    notify.success(`“${row.name}” görevi silindi.`);
    setSelectedId(undefined);
    list.reload();
  };

  return (
    <>
      <p className="xp-defs-note">
        Görev, personelin oteldeki resmi unvanı ve hiyerarşideki yeridir. Sistemde neleri görüp yapabileceğini rol belirler;
        görev yalnızca kullanıcı eklenirken hangi rolün önerileceğini söyler.
      </p>
      {list.error ? (
        <p role="alert" className="xp-defs-error">
          {list.error}
        </p>
      ) : null}
      <DataGrid<JobTitleRow>
        columns={COLUMNS}
        rows={list.rows}
        total={list.total}
        page={1}
        pageSize={Math.max(list.total, 1)}
        onPage={() => undefined}
        onSort={() => undefined}
        onSearch={list.setQ}
        q={list.q}
        selectedId={selectedId}
        onSelect={(row) => setSelectedId(row.id)}
        onActivate={canEdit ? (row) => setDialog({ mode: "edit", row }) : undefined}
        rowContextActions={canEdit ? (row) => [
          { label: "Düzenle", onSelect: () => setDialog({ mode: "edit", row }) },
          { label: "Altına görev ekle", onSelect: () => setDialog({ mode: "new", parentId: row.id }) },
          { label: "Sil", disabled: row.userCount > 0, onSelect: () => void remove(row) },
        ] : undefined}
        emptyText="Görev bulunamadı"
        toolbar={
          <Toolbar
            onNew={canEdit ? () => setDialog({ mode: "new", parentId: selectedId }) : undefined}
            onEdit={canEdit ? () => selected && setDialog({ mode: "edit", row: selected }) : undefined}
            onDelete={canEdit ? () => selected && void remove(selected) : undefined}
            onRefresh={list.reload}
            editDisabled={!selected}
            deleteDisabled={!selected || selected.userCount > 0}
          />
        }
      />
      <FormDialog
        title={editing ? "Görevi düzenle" : "Yeni görev"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
        confirmBeforeSubmit={!!editing}
      >
        <Field name="name" label="Görev adı (resmi unvan)">
          <input type="text" defaultValue={editing?.name ?? ""} maxLength={100} />
        </Field>
        <Field name="department" label="Bölüm">
          <select defaultValue={editing?.department ?? list.rows.find((row) => row.id === startParent)?.department ?? "SERVIS"}>
            {JOB_DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {JOB_DEPARTMENT_LABELS[department]}
              </option>
            ))}
          </select>
        </Field>
        <Field name="parentId" label="Bağlı olduğu görev">
          <select defaultValue={editing?.parentId ?? startParent ?? ""}>
            <option value="">Yok (en üst)</option>
            {parentChoices.map((row) => (
              <option key={row.id} value={row.id}>
                {"   ".repeat(Math.min(row.depth, 6))}
                {row.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="defaultRoleId" label="Önerilen rol">
          <select defaultValue={editing?.defaultRoleId ?? ""}>
            <option value="">Yok</option>
            {(options?.roles ?? []).map((role) => (
              <option key={role.id} value={role.id}>
                {role.name} ({role.code})
              </option>
            ))}
          </select>
        </Field>
        <Field name="sortOrder" label="Sıra (aynı üst görev altında)">
          <input type="text" inputMode="numeric" defaultValue={editing?.sortOrder ?? 500} maxLength={4} />
        </Field>
        <Field name="isActive" label="Kullanıcı formlarında sunulsun">
          <input type="checkbox" defaultChecked={editing?.isActive ?? true} />
        </Field>
        {editing && editing.userCount > 0 ? (
          <p className="xp-defs-note">
            Adı değiştirirseniz bu görevdeki {editing.userCount} kullanıcının unvanı da güncellenir. Rolleri değişmez.
          </p>
        ) : null}
      </FormDialog>
    </>
  );
}
