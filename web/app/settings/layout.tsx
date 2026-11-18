import type { Metadata } from "next";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import ProtectedRoute from "../components/ProtectedRoute";
import AdminLevelBar from "../components/AdminLevelBar";

export const metadata: Metadata = {
  title: "Settings | IAMX",
  description: "IAMX System Settings",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="h-screen flex flex-col bg-[var(--iamx-bg)] text-[var(--iamx-fg)]">
        <Topbar />
        <div className="flex-1 flex min-h-0">
        <Sidebar />
        <div
          data-main-column
          className="flex-1 flex flex-col min-w-0 overflow-hidden transition-[padding] duration-200"
        >
          <AdminLevelBar />
          <main className="flex-1 flex flex-col min-h-0">{children}</main>
          {/* 22/10/69 จอแคบ: หัวหน้า+ปุ่มขึ้นบรรทัดใหม่ได้ ไม่ตัดคำไทยทีละตัว */}
          <style>{`@media (max-width: 767px) {
            [data-main-column] main .justify-between.items-end { flex-wrap: wrap; }
            [data-main-column] main .justify-between.items-end > .min-w-0 { flex: 1 1 100%; }
            [data-main-column] main .justify-between.items-end > .shrink-0 { flex-wrap: wrap; }
            [data-main-column] main h1 { white-space: normal; word-break: keep-all; overflow-wrap: anywhere; }
          }`}</style>
        </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
