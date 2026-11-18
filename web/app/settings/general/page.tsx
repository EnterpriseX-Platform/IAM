"use client";

import { tx } from "@/lib/i18n";
import { useState } from "react";
import { Button, PageHeader, Tabs } from "@/app/components/iamx";
import ObjectTypePage from "../objectType/page";
import ConsoleAdminsPage from "../console-admins/page";
import ItemGroupsSettings from "./ItemGroups";
import UserTypesSettings from "./UserTypes";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

// 22/10/69: ปุ่มล้างแคชทั้งหมด (POST /cache/clear) — ผลแสดงเป็นข้อความ ไม่มีตัวหมุน
function CacheClearBar() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`${API_BASE}/cache/clear`, { method: "POST" });
      setMsg(r.ok ? tx("ล้างแคชแล้ว") : tx("ล้างแคชไม่สำเร็จ"));
    } catch {
      setMsg(tx("ล้างแคชไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageHeader title={tx("ตั้งค่าระบบ")} actions={
      <span className="inline-flex items-center gap-3">
        {msg && <span className="text-[12px] text-[var(--iamx-fg)]">{msg}</span>}
        <Button variant="secondary" icon="refresh" onClick={run} disabled={busy}>{tx("รีเฟรชแคชทั้งหมด")}</Button>
      </span>} />
  );
}

export default function GeneralSettingsPage() {
  const [tab, setTab] = useState("admins");
  return (
    <div className="h-full flex flex-col">
      <CacheClearBar />
      <div className="px-6 bg-[var(--iamx-bg)]">
        <Tabs value={tab} onChange={setTab} className="!mx-0 !px-0" tabs={[{ value: "admins", label: tx("ผู้ดูแล IAMX") }, { value: "groups", label: "Groups" }, { value: "usertypes", label: "User types" }, { value: "types", label: tx("ประเภทเมนู") }]} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto iamx-embedded">
        {tab === "admins" ? <ConsoleAdminsPage /> : tab === "groups" ? <ItemGroupsSettings /> : tab === "usertypes" ? <UserTypesSettings /> : <ObjectTypePage />}
      </div>
    </div>
  );
}
