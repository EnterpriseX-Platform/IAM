"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Eye, EyeOff, Trash2 } from "lucide-react";
import { showSuccess, showError } from "@/lib/swal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

type RoleOption = {
  roleId: string;
  roleName: string;
};

// ✅ ตรวจเลขบัตรประชาชนไทย (checksum)
const isValidThaiNationalId = (id: string) => {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(id[12]);
};

// ✅ ย้าย Input และ Label component ออกมาข้างนอก (แก้ปัญหาหลุด focus)
const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function InputBase(props, ref) {
  const { className, ...rest } = props;
  return (
    <input
      ref={ref}
      {...rest}
      className={
        "w-full h-10 px-3 border border-gray-300 rounded-md bg-white " +
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent " +
        (className ?? "")
      }
    />
  );
});

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-sm font-medium text-gray-700 mb-1">
    {children}
  </label>
);

export default function AddUserPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [tempSelectedRole, setTempSelectedRole] = useState<string>("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ✅ FIX ชัวร์: เลขบัตรใช้ ref (uncontrolled input)
  const nationalIdRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    nationalId: "",

    username: "",
    email: "",

    firstNameTH: "",
    lastNameTH: "",

    firstNameEN: "",
    lastNameEN: "",

    phone: "",
    mobile: "",

    password: "",
    confirmPassword: "",

    status: true,
  });

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const res = await fetch(`${API_BASE}/iamx/api/role`);
      if (res.ok) {
        const data = await res.json();
        const roles = (Array.isArray(data) ? data : []).map((r: any) => ({
          roleId: String(r.roleId ?? r.ROLE_ID ?? r.id ?? ""),
          roleName: String(r.roleName ?? r.ROLE_NAME ?? r.name ?? ""),
        }));
        setAvailableRoles(roles.filter((x) => x.roleId && x.roleName));
        return;
      }
    } catch (e) {
      console.error("fetchRoles error:", e);
    }

    setAvailableRoles([
      { roleId: "1", roleName: "ผู้ดูแลระบบ (Admin)" },
      { roleId: "2", roleName: "เจ้าหน้าที่" },
      { roleId: "3", roleName: "ผู้ใช้งานทั่วไป" },
    ]);
  };

  const roleNameById = useMemo(() => {
    const m = new Map<string, string>();
    availableRoles.forEach((r) => m.set(r.roleId, r.roleName));
    return m;
  }, [availableRoles]);

  const handleAddRole = () => {
    if (!tempSelectedRole) {
      showError("ผิดพลาด", "กรุณาเลือก Role");
      return;
    }
    if (selectedRoles.includes(tempSelectedRole)) {
      showError("ผิดพลาด", "Role นี้ถูกเลือกแล้ว");
      return;
    }
    setSelectedRoles((prev) => [...prev, tempSelectedRole]);
    setTempSelectedRole("");
  };

  const handleRemoveRole = (roleId: string) => {
    setSelectedRoles((prev) => prev.filter((id) => id !== roleId));
  };

  const getNationalId = () => {
    // ✅ ดึงค่าจาก ref เป็นหลัก
    return (nationalIdRef.current?.value ?? formData.nationalId).trim();
  };

  const validate = () => {
    const id = getNationalId();

    if (!id) return "กรุณากรอกเลขบัตรประชาชน";
    if (!/^\d+$/.test(id)) return "เลขบัตรประชาชนต้องเป็นตัวเลขเท่านั้น";
    if (id.length !== 13) return "เลขบัตรประชาชนต้องมี 13 หลัก";
    if (!isValidThaiNationalId(id)) return "เลขบัตรประชาชนไม่ถูกต้อง";

    if (!formData.username.trim()) return "กรุณากรอกชื่อผู้ใช้ (Username)";
    if (!formData.email.trim()) return "กรุณากรอกอีเมล";

    if (!formData.firstNameTH.trim()) return "กรุณากรอกชื่อ (ไทย)";
    if (!formData.lastNameTH.trim()) return "กรุณากรอกนามสกุล (ไทย)";
    if (!formData.firstNameEN.trim()) return "กรุณากรอกชื่อ (English)";
    if (!formData.lastNameEN.trim()) return "กรุณากรอกนามสกุล (English)";

    if (!formData.password) return "กรุณากรอกรหัสผ่าน";
    if (formData.password.length < 8)
      return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
    if (!formData.confirmPassword) return "กรุณายืนยันรหัสผ่าน";
    if (formData.password !== formData.confirmPassword)
      return "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน";

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const err = validate();
    if (err) {
      showError("ผิดพลาด", err);
      return;
    }

    try {
      setLoading(true);

      // ✅ sync ค่าเลขบัตรจาก ref เข้า state (กันหลุด)
      const nationalId = getNationalId();
      setFormData((prev) => ({ ...prev, nationalId }));

      const payload = {
        nationalId,

        username: formData.username,
        email: formData.email,

        firstNameTH: formData.firstNameTH,
        lastNameTH: formData.lastNameTH,
        firstNameEN: formData.firstNameEN,
        lastNameEN: formData.lastNameEN,

        phone: formData.phone,
        mobile: formData.mobile,

        password: formData.password,
        status: formData.status,

        roles: selectedRoles,
      };

      console.log("Submit payload:", payload);

      // เรียก API
      const res = await fetch(`${API_BASE}/iamx/api/user-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || errorData.message || "เกิดข้อผิดพลาด");
      }

      showSuccess("สำเร็จ", "เพิ่มผู้ใช้สำเร็จ");
      router.push("/settings/userInfo");
    } catch (error) {
      console.error("Error adding user:", error);
      showError("ผิดพลาด", "เกิดข้อผิดพลาดในการเพิ่มผู้ใช้");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1400px] mx-auto px-6 py-4">
        {/* top bar */}
        <div className="bg-sky-600 text-white rounded-t-md px-6 py-3 flex items-center justify-between">
          <div className="font-semibold">เพิ่มผู้ใช้ใหม่</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/settings/userInfo")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 border border-white/20"
            >
              <ArrowLeft className="w-4 h-4" />
              ย้อนกลับ
            </button>

            <button
              type="submit"
              form="user-form"
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white text-sky-700 hover:bg-sky-50 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {loading ? "กำลังบันทึก..." : "เพิ่มผู้ใช้"}
            </button>
          </div>
        </div>

        <form id="user-form" onSubmit={handleSubmit}>
          <div className="bg-white rounded-b-md shadow-sm px-6 py-6 space-y-8">
            {/* ✅ เลขบัตรประชาชน (UNCONTROLLED) */}
            <div className="grid grid-cols-1">
              <div className="max-w-[760px]">
                <Label>
                  <span className="text-red-500">*</span> เลขบัตรประชาชน
                </Label>

                <Input
                  ref={nationalIdRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={13}
                  placeholder="1234567890123"
                  defaultValue={formData.nationalId}
                  onInput={(e) => {
                    // ✅ กรองตัวเลข แต่ไม่ setState ระหว่างพิมพ์ (กันค้าง 100%)
                    e.currentTarget.value = e.currentTarget.value
                      .replace(/\D/g, "")
                      .slice(0, 13);
                  }}
                  onBlur={(e) => {
                    // ✅ ค่อย sync เข้า state ตอน blur
                    const value = e.target?.value || "";
                    setFormData((prev) => ({
                      ...prev,
                      nationalId: value,
                    }));
                  }}
                  required
                />

                <p className="mt-1 text-xs text-gray-500">
                  กรอกเลขบัตรประชาชน 13 หลัก (ไม่ต้องใส่ขีด)
                </p>
              </div>
            </div>

            {/* Username + Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>
                  <span className="text-red-500">*</span> ชื่อผู้ใช้ (Username)
                </Label>
                <Input
                  placeholder="john.doe"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, username: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <Label>
                  <span className="text-red-500">*</span> อีเมล
                </Label>
                <Input
                  type="email"
                  placeholder="john.doe@company.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, email: e.target.value }))
                  }
                  required
                />
              </div>
            </div>

            {/* Name */}
            <div className="border-t pt-6">
              <div className="text-sm text-gray-600 mb-4">ชื่อ-นามสกุล</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>
                    <span className="text-red-500">*</span> ชื่อ (ไทย)
                  </Label>
                  <Input
                    placeholder="จอห์น"
                    value={formData.firstNameTH}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        firstNameTH: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label>
                    <span className="text-red-500">*</span> นามสกุล (ไทย)
                  </Label>
                  <Input
                    placeholder="โด"
                    value={formData.lastNameTH}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, lastNameTH: e.target.value }))
                    }
                    required
                  />
                </div>

                <div>
                  <Label>
                    <span className="text-red-500">*</span> ชื่อ (English)
                  </Label>
                  <Input
                    placeholder="John"
                    value={formData.firstNameEN}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        firstNameEN: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label>
                    <span className="text-red-500">*</span> นามสกุล (English)
                  </Label>
                  <Input
                    placeholder="Doe"
                    value={formData.lastNameEN}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, lastNameEN: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="border-t pt-6">
              <div className="text-sm text-gray-600 mb-4">ข้อมูลติดต่อ</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>โทรศัพท์</Label>
                  <Input
                    placeholder="02-123-4567"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, phone: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>มือถือ</Label>
                  <Input
                    placeholder="081-234-5678"
                    value={formData.mobile}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, mobile: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="border-t pt-6">
              <div className="text-sm text-gray-600 mb-4">ความปลอดภัย</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>
                    <span className="text-red-500">*</span> รหัสผ่าน
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="รหัสผ่านอย่างน้อย 8 ตัวอักษร"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, password: e.target.value }))
                      }
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center text-gray-500 hover:text-gray-700"
                      title="แสดง/ซ่อนรหัสผ่าน"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <Label>
                    <span className="text-red-500">*</span> ยืนยันรหัสผ่าน
                  </Label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      placeholder="ยืนยันรหัสผ่าน"
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          confirmPassword: e.target.value,
                        }))
                      }
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center text-gray-500 hover:text-gray-700"
                      title="แสดง/ซ่อนรหัสผ่าน"
                    >
                      {showConfirm ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Roles */}
            <div className="border-t pt-6">
              <div className="text-sm text-gray-600 mb-4">
                สิทธิ์การใช้งาน (Roles)
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1">
                  <select
                    value={tempSelectedRole}
                    onChange={(e) => setTempSelectedRole(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- เลือก Role --</option>
                    {availableRoles
                      .filter((r) => !selectedRoles.includes(r.roleId))
                      .map((r) => (
                        <option key={r.roleId} value={r.roleId}>
                          {r.roleName}
                        </option>
                      ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleAddRole}
                  className="h-10 px-4 rounded-md bg-sky-600 text-white hover:bg-sky-700"
                >
                  + เพิ่ม
                </button>
              </div>

              <div className="border rounded-md overflow-hidden">
                <table className="cds--data-table cds--data-table--sm w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="w-20 px-3 py-2 text-left text-gray-700 font-medium">
                        ลำดับ
                      </th>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">
                        Role
                      </th>
                      <th className="w-20 px-3 py-2 text-center text-gray-700 font-medium">
                        ลบ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRoles.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-6 text-center text-gray-500"
                        >
                          ไม่มีรายการ
                        </td>
                      </tr>
                    ) : (
                      selectedRoles.map((id, idx) => (
                        <tr key={id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-700">{idx + 1}</td>
                          <td className="px-3 py-2 text-gray-900">
                            {roleNameById.get(id) ?? id}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRole(id)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 text-red-600"
                              title="ลบ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Status */}
            <div className="border-t pt-6">
              <div className="text-sm text-gray-600 mb-4">สถานะผู้ใช้งาน</div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setFormData((p) => ({ ...p, status: !p.status }))
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.status ? "bg-green-500" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.status ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span
                  className={`text-sm font-medium ${formData.status ? "text-green-700" : "text-gray-500"}`}
                >
                  {formData.status ? "✅ ใช้งาน" : "❌ ไม่ใช้งาน"}
                </span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
