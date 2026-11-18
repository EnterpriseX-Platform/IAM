"use client";

// 16/11/69: แท็บจาก @carbon/react · props เดิมคงไว้
import { Tab, TabList, Tabs as CTabs } from "@carbon/react";
import { ReactNode } from "react";

export interface TabItem {
  value: string;
  label: ReactNode;
  count?: number;
}

export function Tabs({ value, onChange, tabs, className = "" }: {
  value: string;
  onChange?: (v: string) => void;
  tabs: TabItem[];
  className?: string;
}) {
  const idx = Math.max(0, tabs.findIndex((t) => t.value === value));
  return (
    <div className={`iamx-tabs ${className}`}>
      <CTabs selectedIndex={idx} onChange={({ selectedIndex }: { selectedIndex: number }) => onChange?.(tabs[selectedIndex].value)}>
        <TabList aria-label="Tabs" contained={false}>
          {tabs.map((t) => (
            <Tab key={t.value}>
              {t.label}
              {t.count != null && <span className="ml-1.5 tabular-nums opacity-70">{t.count}</span>}
            </Tab>
          ))}
        </TabList>
      </CTabs>
    </div>
  );
}
