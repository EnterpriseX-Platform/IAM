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
import { activeUserTypes, parseMenuTypes, staffCode, useUserTypes, type MenuType } from "@/lib/menuType";

import { useEffect, useState } from "react";

interface Domain {
  id: number;
  code: string;
  name: string;
  description?: string;
  menu_type: string;
  is_active: number;
}

interface Application {
  id: number;
  code: string;
  name: string;
  description?: string;
  domain_id: number;
  is_active: number;
}

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

type StatusFilter = "" | "active" | "inactive";

const STATUS_LABEL: Record<StatusFilter, string> = {
  "": "",
  active: tx("ใช้งาน"),
  inactive: tx("ปิดใช้งาน"),
};

export default function DomainsPage() {
  useUserTypes();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [selected, setSelected] = useState<number[]>([]);

  const [showDrawer, setShowDrawer] = useState(false);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    menu_type: staffCode(),
    is_active: 1,
  });

  const [drawerApps, setDrawerApps] = useState<Application[]>([]);
  const [drawerAppsLoading, setDrawerAppsLoading] = useState(false);
  const [drawerAppsErr, setDrawerAppsErr] = useState(false);

  useEscapeKey(showDrawer, () => setShowDrawer(false));

  useEffect(() => {
    fetchDomains();
  }, []);

  useEffect(() => {
    if (!showDrawer || !editingDomain) {
      setDrawerApps([]);
      return;
    }
    let cancelled = false;
    setDrawerAppsLoading(true);
    setDrawerAppsErr(false);
    fetch(`${API_BASE}/admin/domains/${editingDomain.id}/applications`)
      .then((r) => r.json().then((d) => { if (!r.ok) throw new Error(); return d; }))
      .then((data) => {
        if (!cancelled) setDrawerApps(data.data || []);
      })
      .catch(() => {
        if (!cancelled) { setDrawerApps([]); setDrawerAppsErr(true); }
      })
      .finally(() => {
        if (!cancelled) setDrawerAppsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showDrawer, editingDomain]);

  const fetchDomains = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/domains`);
      const data = await res.json();
      setDomains(data.data || []);
    } catch (error) {
      console.error("Failed to fetch domains:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      showError(tx("กรุณากรอกข้อมูล"), tx("Code และ Name จำเป็นต้องกรอก"));
      return;
    }
    if (parseMenuTypes(formData.menu_type).length === 0) {
      showError(tx("กรุณาเลือก"), tx("ประเภทเมนูอย่างน้อย 1 ประเภท"));
      return;
    }
    try {
      const res = editingDomain
        ? await fetch(`${API_BASE}/admin/domains/${editingDomain.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData),
          })
        : await fetch(`${API_BASE}/admin/domains`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(tx("บันทึกไม่สำเร็จ"), data.error || data.message || "");
        return;
      }
      setShowDrawer(false);
      fetchDomains();
      showSuccess(editingDomain ? tx("แก้ไขสำเร็จ") : tx("เพิ่มสำเร็จ"));
    } catch (error) {
      console.error("Failed to save domain:", error);
      showError(tx("บันทึกไม่สำเร็จ"));
    }
  };

  const handleDelete = async (domain: Domain) => {
    const confirmed = await showConfirm(
      tx("ยืนยันการลบโดเมน"),
      tx("คุณต้องการลบ \"{0}\" ใช่หรือไม่?", domain.name)
    );
    if (!confirmed) return;
    try {
      await fetch(`${API_BASE}/admin/domains/${domain.id}`, { method: "DELETE" });
      fetchDomains();
      showSuccess(tx("ลบสำเร็จ"));
    } catch (error) {
      console.error("Failed to delete domain:", error);
      showError(tx("ลบไม่สำเร็จ"));
    }
  };

  const toggleActive = async (domain: Domain) => {
    const next = domain.is_active ? 0 : 1;
    // 13/11/69: ถามยืนยันเหมือนการเปิด/ปิดในแท็บระบบงาน (ปิดโดเมน = ทุกเมนูใต้โดเมนหายจากผู้ใช้)
    const ok = await showConfirm(
      tx("ยืนยันการ{0}ใช้งานโดเมน", next ? tx("เปิด") : tx("ปิด")),
      next ? tx("คุณต้องการเปิดใช้งาน \"{0}\" ใช่หรือไม่?", domain.name) : tx("คุณต้องการปิดใช้งาน \"{0}\" ใช่หรือไม่? ระบบงานและเมนูทั้งหมดในโดเมนนี้จะไม่แสดงกับผู้ใช้", domain.name),
      tx("ยืนยัน")
    );
    if (!ok) return;
    try {
      await fetch(`${API_BASE}/admin/domains/${domain.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: domain.code,
          name: domain.name,
          description: domain.description || "",
          // ไม่ส่งประเภทเมนู — API คงค่าเดิมไว้ (ค่าเก่าที่ไม่ใช่ internal/agency จะไม่ถูกเปลี่ยนตอนเปิด/ปิด)
          menu_type: "",
          is_active: next,
        }),
      });
      setDomains((prev) =>
        prev.map((d) => (d.id === domain.id ? { ...d, is_active: next } : d))
      );
    } catch (error) {
      console.error("Failed to toggle:", error);
      showError(tx("ไม่สำเร็จ"));
    }
  };

  const openAddDrawer = () => {
    setEditingDomain(null);
    setFormData({ code: "", name: "", description: "", menu_type: staffCode(), is_active: 1 });
    setShowDrawer(true);
  };

  const openEditDrawer = (domain: Domain) => {
    setEditingDomain(domain);
    setFormData({
      code: domain.code,
      name: domain.name,
      description: domain.description || "",
      menu_type: domain.menu_type || staffCode(),
      is_active: domain.is_active,
    });
    setShowDrawer(true);
  };

  const cycleStatus = () => {
    setStatus((s) => (s === "" ? "active" : s === "active" ? "inactive" : ""));
  };

  const filtered = domains.filter((d) => {
    if (status === "active" && !d.is_active) return false;
    if (status === "inactive" && d.is_active) return false;
    if (search) {
      const hay = `${d.code} ${d.name} ${d.description || ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const allChecked = filtered.length > 0 && filtered.every((d) => selected.includes(d.id));
  const someChecked = !allChecked && filtered.some((d) => selected.includes(d.id));

  const toggleAll = () => {
    if (allChecked) {
      setSelected((prev) => prev.filter((id) => !filtered.find((d) => d.id === id)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...filtered.map((d) => d.id)])));
    }
  };

  const toggleOne = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={tx("โดเมน")}
        actions={
          <Button variant="primary" icon="plus" onClick={openAddDrawer}>
            
            {tx("เพิ่มโดเมน")}
          </Button>
        }
      />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={tx("ค้นหาโดเมน...")}
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
            {filtered.length} {" "}{tx("รายการ")}
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
            icon={search ? "search" : "globe"}
            title={search ? tx("ไม่พบ \"{0}\"", search) : tx("ยังไม่มีโดเมน")}
            action={
              !search ? (
                <Button variant="primary" icon="plus" onClick={openAddDrawer}>
                  
                  {tx("สร้างโดเมนแรก")}
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
                <th className="w-32 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("รหัส")}
                </th>
                <th className="text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("ชื่อโดเมน")}
                </th>
                <th className="w-28 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("สถานะ")}
                </th>
                <th className="w-28 h-9 px-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const checked = selected.includes(d.id);
                return (
                  <tr
                    key={d.id}
                    onClick={() => openEditDrawer(d)}
                    className="group/row border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)] cursor-pointer"
                    style={{ height: "var(--iamx-row-h)" }}
                  >
                    <td className="px-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        
                        checked={checked}
                        onChange={() => toggleOne(d.id)}
                        className="w-4 h-4 rounded border-[var(--iamx-border-strong)]"
                        style={{ accentColor: "var(--iamx-accent)" }}
                      />
                    </td>
                    <td className="px-3 align-middle">
                      <span className="font-mono text-[12px] text-[var(--iamx-fg)] font-medium">
                        {d.code}
                      </span>
                    </td>
                    <td className="px-3 align-middle">
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--iamx-fg)] truncate">{d.name}</div>
                        {d.description && (
                          <div className="text-[12px] text-[var(--iamx-fg-muted)] truncate">
                            {d.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      {/* 13/11/69: เดิมสวิตช์อยู่ในปุ่มอีกชั้น → กดครั้งเดียวสั่งสองครั้ง · เหลือสวิตช์ตัวเดียว */}
                      <span className="inline-flex items-center gap-2">
                        <Toggle checked={!!d.is_active} size="sm" onChange={() => toggleActive(d)} />
                        <span className="text-[12px] text-[var(--iamx-fg)]">
                          {d.is_active ? tx("ใช้งาน") : tx("ปิดใช้งาน")}
                        </span>
                      </span>
                    </td>
                    <td
                      className="px-3 align-middle text-right opacity-0 group-hover/row:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-0.5">
                        <IconButton icon="edit" label={tx("แก้ไข")} onClick={() => openEditDrawer(d)} />
                        <IconButton
                          icon="trash"
                          label={tx("ลบ")}
                          variant="danger"
                          onClick={() => handleDelete(d)}
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
        title={editingDomain ? tx("แก้ไข: {0}", formData.name || editingDomain.name) : tx("เพิ่มโดเมนใหม่")}
        subtitle={
          editingDomain ? tx("รหัส {0}", editingDomain.code) : tx("กำหนดข้อมูลพื้นฐานของโดเมน")
        }
        width={560}
        persistKey="iamx-drawer-domain"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowDrawer(false)}>
              
              {tx("ยกเลิก")}
            </Button>
            <Button variant="primary" size="sm" icon="check" onClick={handleSave}>
              {editingDomain ? tx("บันทึก") : tx("สร้างโดเมน")}
            </Button>
          </>
        }
      >
        <DrawerSection title={tx("ข้อมูลพื้นฐาน")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
            <FormField label={tx("รหัส")} required>
              <Input
                value={formData.code}
                onChange={(v) => setFormData((p) => ({ ...p, code: v }))}
                placeholder={tx("เช่น ERP")}
                autoFocus
              />
            </FormField>
            <FormField label={tx("ชื่อ")} required>
              <Input
                value={formData.name}
                onChange={(v) => setFormData((p) => ({ ...p, name: v }))}
                placeholder={tx("เช่น ERP Portal")}
              />
            </FormField>
          </div>
          <FormField label={tx("ประเภทเมนู")} required className="mt-3">
            <div role="group" aria-label={tx("ประเภทเมนู")} className="flex flex-wrap items-center gap-x-6 gap-y-2" style={{ fontSize: 13 }}>
              {activeUserTypes().map((x) => x.code).map((t) => {
                const selectedTypes = parseMenuTypes(formData.menu_type);
                return (
                  <label key={t} className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      
                      checked={selectedTypes.includes(t)}
                      onChange={(e) => {
                        const next: MenuType[] = e.target.checked
                          ? [...selectedTypes, t]
                          : selectedTypes.filter((x) => x !== t);
                        setFormData((p) => ({ ...p, menu_type: parseMenuTypes(next.join(",")).join(",") }));
                      }}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "var(--iamx-accent)" }}
                    />
                    {activeUserTypes().find((x) => x.code === t)?.name}
                  </label>
                );
              })}
            </div>
          </FormField>
          <FormField label={tx("รายละเอียด (ไม่บังคับ)")} className="mt-3">
            <Textarea
              value={formData.description}
              onChange={(v) => setFormData((p) => ({ ...p, description: v }))}
              placeholder={tx("คำอธิบายโดเมน...")}
              rows={3}
            />
          </FormField>
        </DrawerSection>

        <DrawerSection title={tx("สถานะ")}>
          <Toggle
            checked={!!formData.is_active}
            onChange={(v) => setFormData((p) => ({ ...p, is_active: v ? 1 : 0 }))}
            label={tx("เปิดใช้งาน")}
          />
        </DrawerSection>

        {editingDomain && (
          <DrawerSection title={tx("ระบบงานภายใน")}>
            {drawerAppsLoading ? (
              <div className="flex items-center justify-center py-6">
                <span className="text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</span>
              </div>
            ) : drawerApps.length === 0 ? (
              <div className="text-center py-6 text-[12.5px] text-[var(--iamx-fg-muted)]">
                {drawerAppsErr ? <span className="text-red-600">{tx("โหลดระบบงานไม่สำเร็จ")}</span> : tx("ยังไม่มีระบบงาน")}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--iamx-border)] -my-2">
                {drawerApps.map((app) => (
                  <li key={app.id} className="py-1.5 flex items-baseline gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[var(--iamx-fg)] truncate">
                        {app.name}
                      </div>
                      <div className="text-[11.5px] text-[var(--iamx-fg-muted)] font-mono truncate">
                        {app.code}
                      </div>
                    </div>
                    {!app.is_active && <span className="shrink-0 text-[11px] px-2 rounded-full bg-amber-100 text-amber-700">{tx("ปิดใช้งาน")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </DrawerSection>
        )}

        {editingDomain && (
          <DrawerSection
            title={tx("โซนอันตราย")}
            description={tx("ลบถาวร · ต้องไม่มีระบบงานอยู่ภายใน")}
          >
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                setShowDrawer(false);
                handleDelete(editingDomain);
              }}
            >
              
              {tx("ลบโดเมนนี้")}
            </Button>
          </DrawerSection>
        )}
      </Drawer>
    </div>
  );
}
