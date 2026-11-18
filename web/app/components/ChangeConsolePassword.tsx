"use client";

import { tx } from "@/lib/i18n";
// 20/10/69 เปลี่ยนรหัสผ่านผู้ดูแล IAM-X Console (ตาราง IAMX.ADMIN) — กติกาเดียวกับหน้าสมัคร
import { Button, Drawer, DrawerSection, FormField, Input } from "@/app/components/iamx";
import { showError, showSuccess } from "@/lib/swal";
import { useState } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

export function ChangeConsolePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const rules = [
    { ok: f.next.length >= 10, label: tx("อย่างน้อย 10 ตัวอักษร") },
    { ok: /^[\x21-\x7E]*$/.test(f.next) && f.next.length > 0, label: tx("ภาษาอังกฤษ ตัวเลข อักขระพิเศษเท่านั้น") },
    { ok: /[A-Z]/.test(f.next) && /[a-z]/.test(f.next), label: tx("ตัวพิมพ์ใหญ่และพิมพ์เล็ก") },
    { ok: /[0-9]/.test(f.next), label: tx("ตัวเลข") },
    { ok: /[^A-Za-z0-9]/.test(f.next), label: tx("อักขระพิเศษ") },
  ];
  const valid = f.current && rules.every((r) => r.ok) && f.next === f.confirm;
  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/console-admins/me/password`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: f.current, new: f.next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.message || tx("เปลี่ยนรหัสผ่านไม่สำเร็จ"));
      setF({ current: "", next: "", confirm: "" });
      onClose();
      showSuccess(tx("เปลี่ยนรหัสผ่านแล้ว"), "");
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={tx("เปลี่ยนรหัสผ่าน")} width={440} persistKey="iamx-change-pw"
      footer={<div className="flex gap-2 ml-auto"><Button variant="secondary" size="sm" onClick={onClose}>{tx("ยกเลิก")}</Button><Button variant="primary" size="sm" disabled={!valid || busy} onClick={save}>{tx("บันทึก")}</Button></div>}>
      <DrawerSection>
        <div className="space-y-4">
          <FormField label={tx("รหัสผ่านปัจจุบัน")} required><Input type="password" value={f.current} onChange={(v) => setF((x) => ({ ...x, current: v }))} autoComplete="current-password" /></FormField>
          <FormField label={tx("รหัสผ่านใหม่")} required>
            <Input type="password" value={f.next} onChange={(v) => setF((x) => ({ ...x, next: v }))} autoComplete="new-password" />
            <ul className="mt-2 space-y-0.5">
              {rules.map((r) => <li key={r.label} className={"text-[12px] " + (r.ok ? "text-emerald-700" : "text-[var(--iamx-fg-muted)]")}>{r.ok ? "✓" : "○"} {r.label}</li>)}
            </ul>
          </FormField>
          <FormField label={tx("ยืนยันรหัสผ่านใหม่")} required>
            <Input type="password" value={f.confirm} onChange={(v) => setF((x) => ({ ...x, confirm: v }))} autoComplete="new-password" />
            {f.confirm && <div className={"mt-1 text-[12px] " + (f.confirm === f.next ? "text-emerald-700" : "text-red-600")}>{f.confirm === f.next ? tx("✓ รหัสผ่านตรงกัน") : tx("⚠ รหัสผ่านไม่ตรงกัน")}</div>}
          </FormField>
        </div>
      </DrawerSection>
    </Drawer>
  );
}
