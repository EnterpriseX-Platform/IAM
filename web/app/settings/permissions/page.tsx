"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Search,
  Plus,
  Download,
  Trash2,
  Edit,
  MoreVertical,
} from "lucide-react";
import { showSuccess, showError, showConfirm } from "@/lib/swal";

// API Response type (ตรงกับ AccessTypeResponse จาก Go backend)
type AccessTypeRow = {
  accessTypeId: number;
  accessTypeName: string;
  accessTypeMainId: string | null;
  accessTypeMain: string | null;
  accessTypeDesc: string | null;
  status: string | null;
  createDate?: string;
};

// Dropdown option type
type OptionType = {
  value: number;
  label: string;
};

// Form state สำหรับ Create/Edit
type FormState = {
  accessTypeName: string;
  accessTypeMainId: string;
  accessTypeDesc: string;
  status: string;
};

const emptyForm: FormState = {
  accessTypeName: "",
  accessTypeMainId: "",
  accessTypeDesc: "",
  status: "active",
};

const API_URL = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";

export default function CategoryPermissionPage() {
  const [accessTypes, setAccessTypes] = useState<AccessTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // pagination state
  const [page, setPage] = useState(1);
  const limit = 10;
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // modal state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  // dropdown menu state
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // dropdown options
  const [accessTypeOptions, setAccessTypeOptions] = useState<OptionType[]>([]);

  // Fetch access types from API
  useEffect(() => {
    fetchAccessTypes();
  }, [page, searchTerm]);

  useEffect(() => {
    fetchAccessTypeOptions();
  }, []);

  const fetchAccessTypes = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
      });

      const response = await fetch(`${API_URL}/iamx/api/access-types/?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch access types: ${response.statusText}`);
      }

      const result = await response.json();
      setAccessTypes(result.data || []);
      setTotal(result.total || 0);
      setTotalPages(result.totalPages || 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล",
      );
      console.error("Error fetching access types:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccessTypeOptions = async () => {
    try {
      const response = await fetch(`${API_URL}/iamx/api/admin/options/access-types`);
      if (!response.ok) {
        throw new Error("Failed to fetch access type options");
      }
      const data = await response.json();
      setAccessTypeOptions(data);
    } catch (err) {
      console.error("Error fetching access type options:", err);
    }
  };

  // ESC close modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId !== null) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId]);

  // ไม่ต้อง filter ฝั่ง client เพราะ server ทำให้แล้ว
  const filtered = accessTypes;

  const openAddModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setOpen(true);
  };

  const openEditModal = (accessType: AccessTypeRow) => {
    setForm({
      accessTypeName: accessType.accessTypeName,
      accessTypeMainId: accessType.accessTypeMainId || "",
      accessTypeDesc: accessType.accessTypeDesc || "",
      status: accessType.status || "active",
    });
    setEditingId(accessType.accessTypeId);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setForm(emptyForm);
    setEditingId(null);
  };

  const validate = () => {
    if (!form.accessTypeName.trim()) return "กรุณาระบุชื่อประเภทการเข้าถึง";
    return null;
  };

  const onSave = async () => {
    const err = validate();
    if (err) {
      showError("ข้อมูลไม่ครบถ้วน", err);
      return;
    }

    try {
      const requestBody = {
        access_type_name: form.accessTypeName.trim(),
        access_type_main_id: form.accessTypeMainId.trim() || null,
        access_type_desc: form.accessTypeDesc.trim() || null,
        status: form.status || null,
      };

      const isEditing = editingId !== null;
      const url = isEditing
        ? `${API_URL}/iamx/api/access-types/${editingId}`
        : `${API_URL}/iamx/api/access-types/`;
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message ||
            `Failed to ${isEditing ? "update" : "create"} access type`,
        );
      }

      // Refresh the access types list
      await fetchAccessTypes();
      closeModal();
      showSuccess(
        isEditing ? "แก้ไขสำเร็จ" : "เพิ่มสำเร็จ",
        isEditing ? "แก้ไขประเภทการเข้าถึงสำเร็จ" : "เพิ่มประเภทการเข้าถึงสำเร็จ"
      );
    } catch (err) {
      showError(
        "เกิดข้อผิดพลาด",
        err instanceof Error ? err.message : `เกิดข้อผิดพลาดในการ${editingId !== null ? "แก้ไข" : "เพิ่ม"}ประเภทการเข้าถึง`
      );
      console.error("Error saving access type:", err);
    }
  };

  const onDelete = async (id: number) => {
    const ok = await showConfirm("ยืนยันการลบ", "ยืนยันการลบข้อมูลประเภทการเข้าถึงนี้?");
    if (!ok) return;

    try {
      const response = await fetch(`${API_URL}/iamx/api/access-types/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete access type");
      }

      // Refresh the access types list
      await fetchAccessTypes();
      showSuccess("ลบสำเร็จ", "ลบประเภทการเข้าถึงสำเร็จ");
    } catch (err) {
      showError(
        "เกิดข้อผิดพลาด",
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการลบประเภทการเข้าถึง"
      );
      console.error("Error deleting access type:", err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Navigation */}
      <div className="flex">
        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {/* Header */}

          {/* Page Title */}
          <div className="bg-blue-600 text-white p-6">
            <h2 className="text-2xl font-bold">การเข้าถึงข้อมูล</h2>
          </div>

          {/* Search and Actions */}
          <div className="p-6">
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-md">
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={20}
                  />
                  <input
                    type="text"
                    placeholder="ค้นหาประเภทการเข้าถึง"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    onClick={openAddModal}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    <Plus size={20} />
                    เพิ่มหมวดหมู่
                  </button>

                  <button className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                    <Download size={20} />
                    ปุ่มพิมพ์
                  </button>

                  <button className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600">
                    <Download size={20} />
                    ส่งออกข้อมูล
                  </button>
                </div>
              </div>

              {/* Loading state */}
              {loading && (
                <div className="text-center py-8 text-gray-500">
                  กำลังโหลดข้อมูล...
                </div>
              )}

              {/* Error state */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              {/* Table */}
              {!loading && !error && (
                <div className="overflow-x-auto">
                  <table className="cds--data-table cds--data-table--sm w-full min-w-[980px]">
                    <thead className="bg-gray-100 border-b-2 border-gray-300">
                      <tr>
                        <th className="p-3 text-left text-sm font-medium"></th>
                        <th className="p-3 text-left text-sm font-medium">
                          ลำดับ
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          รหัส
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          ชื่อ
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          ประเภทหลัก
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          คำอธิบาย
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          สถานะ
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          วันที่สร้าง
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((accessType, index) => (
                        <tr
                          key={accessType.accessTypeId}
                          className="border-b hover:bg-gray-50"
                        >
                          <td className="p-3 text-sm">
                            <div className="relative flex justify-center">
                              <button
                                className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                title="เมนู"
                                onClick={() =>
                                  setOpenMenuId(
                                    openMenuId === accessType.accessTypeId
                                      ? null
                                      : accessType.accessTypeId,
                                  )
                                }
                              >
                                <MoreVertical size={18} />
                              </button>

                              {/* Dropdown Menu */}
                              {openMenuId === accessType.accessTypeId && (
                                <div
                                  ref={dropdownRef}
                                  className="absolute left-full top-0 w-40 bg-white rounded-md shadow-lg border border-gray-200 z-50"
                                >
                                  <div className="py-1">
                                    <button
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        openEditModal(accessType);
                                      }}
                                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                      <Edit size={16} />
                                      แก้ไข
                                    </button>
                                    <button
                                      className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        onDelete(accessType.accessTypeId);
                                      }}
                                    >
                                      <Trash2 size={16} />
                                      ลบ
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-sm">
                            {(page - 1) * limit + index + 1}
                          </td>
                          <td className="p-3 text-sm font-medium">
                            {accessType.accessTypeId}
                          </td>
                          <td className="p-3 text-sm">
                            {accessType.accessTypeName}
                          </td>
                          <td className="p-3 text-sm text-gray-500">
                            {accessType.accessTypeMain || "-"}
                          </td>
                          <td className="p-3 text-sm">
                            {accessType.accessTypeDesc || "-"}
                          </td>
                          <td className="p-3 text-sm">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium border ${
                                accessType.status === "active"
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                              }`}
                            >
                              {accessType.status === "active"
                                ? "เปิดใช้งาน"
                                : "ปิดใช้งาน"}
                            </span>
                          </td>
                          <td className="p-3 text-sm whitespace-nowrap">
                            {accessType.createDate
                              ? new Date(accessType.createDate).toLocaleString(
                                  "th-TH",
                                )
                              : "-"}
                          </td>
                        </tr>
                      ))}

                      {filtered.length === 0 && (
                        <tr>
                          <td
                            colSpan={8}
                            className="p-8 text-center text-gray-500"
                          >
                            ไม่พบข้อมูล
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination Controls */}
              {!loading && !error && totalPages > 1 && (
                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t">
                  <div className="text-sm text-gray-700">
                    แสดง {(page - 1) * limit + 1} ถึง{" "}
                    {Math.min(page * limit, total)} จาก {total} รายการ
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                      className="px-3 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      แรก
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      ก่อนหน้า
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (page <= 3) {
                            pageNum = i + 1;
                          } else if (page >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = page - 2 + i;
                          }

                          return (
                            <button
                              key={i}
                              onClick={() => setPage(pageNum)}
                              className={`px-3 py-1 rounded text-sm ${
                                page === pageNum
                                  ? "bg-blue-600 text-white font-medium"
                                  : "border bg-white hover:bg-gray-50"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        },
                      )}
                    </div>

                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="px-3 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      ถัดไป
                    </button>
                    <button
                      onClick={() => setPage(totalPages)}
                      disabled={page === totalPages}
                      className="px-3 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      สุดท้าย
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ===== Modal (Pure Tailwind) ===== */}
          {open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              {/* overlay */}
              <div
                className="absolute inset-0 bg-black/40"
                onClick={closeModal}
              />

              {/* modal */}
              <div className="relative w-[520px] max-w-[92vw] rounded-lg bg-white shadow-lg">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <h3 className="text-lg font-semibold">
                    {editingId !== null ? "แก้ไข" : "เพิ่ม"}หมวดหมู่สิทธิ
                    (Access Type)
                  </h3>
                  <button
                    className="text-gray-500 hover:text-gray-800"
                    onClick={closeModal}
                    aria-label="close"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-5 grid gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">
                      <span className="text-red-500">*</span>{" "}
                      ชื่อประเภทการเข้าถึง
                    </label>
                    <input
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="เช่น ระดับการเข้าถึงข้อมูล"
                      value={form.accessTypeName}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          accessTypeName: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">ประเภทหลัก</label>
                    <select
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.accessTypeMainId}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          accessTypeMainId: e.target.value,
                        }))
                      }
                    >
                      <option value="">-- เลือกประเภทหลัก --</option>
                      {accessTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">คำอธิบาย</label>
                    <textarea
                      className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="คำอธิบายเพิ่มเติม (optional)"
                      rows={3}
                      value={form.accessTypeDesc}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          accessTypeDesc: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">
                      <span className="text-red-500">*</span> สถานะ
                    </label>
                    <select
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.status}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, status: e.target.value }))
                      }
                    >
                      <option value="active">เปิดใช้งาน</option>
                      <option value="inactive">ปิดใช้งาน</option>
                    </select>
                  </div>
                </div>

                <div className="px-5 py-4 border-t flex justify-end gap-2">
                  <button
                    className="h-10 px-4 rounded-md border bg-white hover:bg-gray-50"
                    onClick={closeModal}
                  >
                    ยกเลิก
                  </button>
                  <button
                    className="h-10 px-4 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    onClick={onSave}
                  >
                    บันทึก
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ===== /Modal ===== */}
        </div>
      </div>
    </div>
  );
}
