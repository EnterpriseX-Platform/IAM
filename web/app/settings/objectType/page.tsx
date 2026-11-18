"use client";
import { Checkbox } from "@/app/components/iamx/Check";

import { tx } from "@/lib/i18n";
import {
  Button,
  Drawer,
  DrawerSection,
  EmptyState,
  FilterChip,
  FormField,
  IconButton,
  Input,
  PageHeader,
  Textarea,
  Toggle,
  Toolbar,
} from "@/app/components/iamx";
import { showConfirm, showError, showSuccess } from "@/lib/swal";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useEffect, useState } from "react";

type ObjectTypeRow = {
  id?: number;
  code?: string;
  name?: string;
  description?: string | null;
  is_active?: number;
  created_at?: string;
  updated_at?: string;
};

type FormState = {
  code: string;
  name: string;
  description: string;
  is_active: number;
};

const emptyForm: FormState = {
  code: "",
  name: "",
  description: "",
  is_active: 1,
};

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

type StatusFilter = "" | "active" | "inactive";

const STATUS_LABEL: Record<StatusFilter, string> = {
  "": "",
  active: tx("ใช้งาน"),
  inactive: tx("ปิดใช้งาน"),
};

export default function ObjectTypePage() {
  const [rows, setRows] = useState<ObjectTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [selected, setSelected] = useState<number[]>([]);

  const [showDrawer, setShowDrawer] = useState(false);
  const [editingRow, setEditingRow] = useState<ObjectTypeRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEscapeKey(showDrawer, () => setShowDrawer(false));

  useEffect(() => {
    fetchObjectTypes();
  }, []);

  const fetchObjectTypes = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/object-types`);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
      const result = await res.json();
      setRows(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      console.error("Error fetching object types:", err);
    } finally {
      setLoading(false);
    }
  };

  const openAddDrawer = () => {
    setEditingRow(null);
    setForm(emptyForm);
    setShowDrawer(true);
  };

  const openEditDrawer = (r: ObjectTypeRow) => {
    setEditingRow(r);
    setForm({
      code: r.code || "",
      name: r.name || "",
      description: r.description || "",
      is_active: r.is_active ?? 1,
    });
    setShowDrawer(true);
  };

  const handleDelete = async (r: ObjectTypeRow) => {
    const id = r.id;
    if (!id) return;
    const confirmed = await showConfirm(tx("ยืนยันการลบ"), tx("ลบ \"{0}\"?", r.name));
    if (!confirmed) return;
    try {
      const res = await fetch(`${API_BASE}/admin/object-types/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await fetchObjectTypes();
      showSuccess(tx("ลบสำเร็จ"));
    } catch (err) {
      showError(tx("ผิดพลาด"), err instanceof Error ? err.message : tx("เกิดข้อผิดพลาด"));
    }
  };

  const toggleActive = async (r: ObjectTypeRow) => {
    if (!r.id) return;
    const next = r.is_active === 1 ? 0 : 1;
    try {
      const res = await fetch(`${API_BASE}/admin/object-types/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: r.code,
          name: r.name,
          description: r.description || null,
          is_active: next,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setRows((prev) => prev.map((p) => (p.id === r.id ? { ...p, is_active: next } : p)));
    } catch (err) {
      showError(tx("ผิดพลาด"), err instanceof Error ? err.message : tx("เกิดข้อผิดพลาด"));
    }
  };

  const onSave = async () => {
    if (!form.code.trim()) return showError(tx("กรุณากรอกข้อมูล"), tx("กรุณาระบุรหัส"));
    if (!form.name.trim()) return showError(tx("กรุณากรอกข้อมูล"), tx("กรุณาระบุชื่อ"));

    const duplicated = rows.some(
      (r) =>
        r.id !== editingRow?.id &&
        (r.code || "").trim().toLowerCase() === form.code.trim().toLowerCase()
    );
    if (duplicated) return showError(tx("ข้อมูลซ้ำ"), tx("รหัสซ้ำ กรุณาใช้รหัสอื่น"));

    try {
      const requestBody = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
      };
      const url = editingRow?.id
        ? `${API_BASE}/admin/object-types/${editingRow.id}`
        : `${API_BASE}/admin/object-types`;
      const method = editingRow?.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) throw new Error("Failed to save");

      await fetchObjectTypes();
      setShowDrawer(false);
      showSuccess(editingRow?.id ? tx("แก้ไขสำเร็จ") : tx("เพิ่มสำเร็จ"));
    } catch (err) {
      showError(tx("ผิดพลาด"), err instanceof Error ? err.message : tx("เกิดข้อผิดพลาด"));
    }
  };

  const cycleStatus = () => {
    setStatus((s) => (s === "" ? "active" : s === "active" ? "inactive" : ""));
  };

  const filtered = rows.filter((r) => {
    if (status === "active" && r.is_active !== 1) return false;
    if (status === "inactive" && r.is_active === 1) return false;
    if (search) {
      const hay = `${r.code || ""} ${r.name || ""} ${r.description || ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const allChecked = filtered.length > 0 && filtered.every((r) => r.id != null && selected.includes(r.id));
  const someChecked = !allChecked && filtered.some((r) => r.id != null && selected.includes(r.id));

  const toggleAll = () => {
    if (allChecked) {
      setSelected((prev) => prev.filter((id) => !filtered.find((r) => r.id === id)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...filtered.map((r) => r.id!).filter(Boolean)])));
    }
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={tx("ประเภทเมนู")}
        actions={
          <Button variant="primary" icon="plus" onClick={openAddDrawer}>
            
            {tx("เพิ่มประเภท")}
          </Button>
        }
      />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={tx("ค้นหาประเภท...")}
        filters={
          <FilterChip
            label={tx("สถานะ")}
            value={STATUS_LABEL[status] || undefined}
            onClick={cycleStatus}
            onClear={() => setStatus("")}
          />
        }
        right={
          <span className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">
            {filtered.length} {" "}{tx("ประเภท")}
          </span>
        }
        selectedCount={selected.length}
        onClearSelection={() => setSelected([])}
        bulkActions={null}
      />

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={search ? "search" : "block"}
            title={search ? tx("ไม่พบ \"{0}\"", search) : tx("ยังไม่มีประเภท")}
            action={
              !search ? (
                <Button variant="primary" icon="plus" onClick={openAddDrawer}>
                  
                  {tx("สร้างประเภทแรก")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="cds--data-table cds--data-table--sm w-full text-[13px] border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--iamx-bg)]">
              <tr className="border-b border-[var(--iamx-border)]">
                <th className="w-10 h-9 px-3">
                  <Checkbox
                    
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-[var(--iamx-border-strong)]"
                    style={{ accentColor: "var(--iamx-accent)" }}
                  />
                </th>
                <th className="w-40 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("รหัส")}
                </th>
                <th className="text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("ชื่อประเภท")}
                </th>
                <th className="w-28 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("สถานะ")}
                </th>
                <th className="w-24 h-9 px-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const checked = r.id != null && selected.includes(r.id);
                const isActive = r.is_active === 1;
                return (
                  <tr
                    key={r.id}
                    onClick={() => openEditDrawer(r)}
                    className="group/row border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)] cursor-pointer"
                    style={{ height: "var(--iamx-row-h)" }}
                  >
                    <td className="px-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        
                        checked={checked}
                        onChange={() => r.id != null && toggleOne(r.id)}
                        className="w-4 h-4 rounded border-[var(--iamx-border-strong)]"
                        style={{ accentColor: "var(--iamx-accent)" }}
                      />
                    </td>
                    <td className="px-3 align-middle">
                      <span className="font-mono text-[12px] text-[var(--iamx-fg)] font-medium">
                        {r.code}
                      </span>
                    </td>
                    <td className="px-3 align-middle">
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--iamx-fg)] truncate">{r.name}</div>
                        {r.description && (
                          <div className="text-[12px] text-[var(--iamx-fg-muted)] truncate">
                            {r.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      {/* 13/11/69: เดิมสวิตช์อยู่ในปุ่มอีกชั้น → กดครั้งเดียวสั่งสองครั้ง */}
                      <span className="inline-flex items-center gap-2">
                        <Toggle checked={isActive} size="sm" onChange={() => toggleActive(r)} />
                        <span className="text-[12px] text-[var(--iamx-fg)]">
                          {isActive ? tx("ใช้งาน") : tx("ปิดใช้งาน")}
                        </span>
                      </span>
                    </td>
                    <td
                      className="px-3 align-middle text-right opacity-0 group-hover/row:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-0.5">
                        <IconButton icon="edit" label={tx("แก้ไข")} onClick={() => openEditDrawer(r)} />
                        <IconButton
                          icon="trash"
                          label={tx("ลบ")}
                          variant="danger"
                          onClick={() => handleDelete(r)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {filtered.length > 0 && (
          <div className="px-6 py-3 text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">
            
            {tx("แสดง 1–")}{filtered.length} {" "}{tx("จาก")}{" "}{filtered.length}
          </div>
        )}
      </div>

      <Drawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        title={editingRow?.id ? tx("แก้ไข: {0}", form.name || editingRow.name) : tx("เพิ่มประเภทใหม่")}
        subtitle={editingRow?.id ? tx("รหัส {0}", editingRow.code) : ""}
        width={520}
        persistKey="iamx-drawer-objecttype"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowDrawer(false)}>
              
              {tx("ยกเลิก")}
            </Button>
            <Button variant="primary" size="sm" icon="check" onClick={onSave}>
              {editingRow?.id ? tx("บันทึก") : tx("สร้าง")}
            </Button>
          </>
        }
      >
        <DrawerSection title={tx("ข้อมูลพื้นฐาน")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
            <FormField label={tx("รหัส")} required>
              <Input
                value={form.code}
                onChange={(v) => setForm((p) => ({ ...p, code: v }))}
                placeholder={tx("เช่น MENU")}
                maxLength={50}
                autoFocus
              />
            </FormField>
            <FormField label={tx("ชื่อ")} required>
              <Input
                value={form.name}
                onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                placeholder={tx("เช่น เมนูหลัก")}
                maxLength={100}
              />
            </FormField>
          </div>
          <FormField label={tx("คำอธิบาย")} className="mt-3">
            <Textarea
              value={form.description}
              onChange={(v) => setForm((p) => ({ ...p, description: v }))}
              rows={2}
              maxLength={255}
              placeholder={tx("คำอธิบาย (ไม่บังคับ)")}
            />
          </FormField>
        </DrawerSection>

        <DrawerSection title={tx("สถานะ")}>
          <Toggle
            checked={form.is_active === 1}
            onChange={(v) => setForm((p) => ({ ...p, is_active: v ? 1 : 0 }))}
            label={tx("เปิดใช้งาน")}
            sublabel={tx("ประเภทที่ปิดใช้งานจะไม่ปรากฏในรายการเลือก")}
          />
        </DrawerSection>
      </Drawer>
    </div>
  );
}
