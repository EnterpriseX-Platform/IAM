"use client";

// 14/11/69: บอกระดับผู้ดูแลที่จำกัดสิทธิ์ (API บังคับจริงที่ด่านกลาง แถบนี้แค่บอกให้รู้)
import { useAuth } from "../contexts/AuthContext";

export default function AdminLevelBar() {
  const { user } = useAuth();
  const role = (user as { role?: string } | null)?.role;
  if (role === "auditor") {
    return <div className="px-6 py-2 text-[12.5px] border-b border-[var(--iamx-border)] bg-blue-50 text-blue-700">Read-only access · Auditor</div>;
  }
  if (role === "access_manager") {
    return <div className="px-6 py-2 text-[12.5px] border-b border-[var(--iamx-border)] bg-blue-50 text-blue-700">Access manager · menu structure and IAMX admins are view-only</div>;
  }
  return null;
}
