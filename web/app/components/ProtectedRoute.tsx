"use client";

import { tx } from "@/lib/i18n";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // 14/11/69: เปิดลิงก์ตรงตอนยังไม่เข้าระบบ → เข้าแล้วกลับหน้าที่ตั้งใจเปิด
      const next = window.location.pathname.replace(/^\/iamx/, "") + window.location.search;
      router.push(next && next !== "/" && !next.startsWith("/login") ? `/login?next=${encodeURIComponent(next)}` : "/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{tx("กำลังโหลด…")}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
