"use client";

import { Tabs } from "@/app/components/iamx";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

export type PageTab = { value: string; label: string; render: () => ReactNode };

function Inner({ base, tabs }: { base: string; tabs: PageTab[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  // แท็บอยู่ใน URL (?tab=) — ลิงก์ตรง/ปุ่มย้อนกลับของเบราว์เซอร์ใช้ได้ · เมนูย่อยใน Sidebar ลิงก์มาที่นี่
  const cur = tabs.find((t) => t.value === sp.get("tab")) || tabs[0];
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-3 border-b border-[var(--iamx-border)] bg-[var(--iamx-bg)]">
        <Tabs className="!mx-0 !px-0 border-b-0" value={cur.value} onChange={(v) => router.push(`${base}?tab=${v}`)} tabs={tabs.map(({ value, label }) => ({ value, label }))} />
      </div>
      <div className="flex-1 min-h-0">{cur.render()}</div>
    </div>
  );
}

export default function TabbedPage(props: { base: string; tabs: PageTab[] }) {
  return (
    <Suspense fallback={null}>
      <Inner {...props} />
    </Suspense>
  );
}
