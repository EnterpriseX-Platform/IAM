"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Search,
  Plus,
  Download,
  Trash2,
  Edit,
  MoreVertical,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { showSuccess, showError, showConfirm } from "@/lib/swal";

// API Response type (ตรงกับ PermissionResponse จาก Go backend)
type PermissionRow = {
  permissionId: number;
  permissionCode: string | null;
  permissionName: string;
  permissionDesc: string | null;
  status: string | null;
  systemId: number | null;
  systemName: string | null;
  createDate?: string;
};

// System option type
type SystemOption = {
  systemId: number;
  systemName: string;
};

// Grouped data type
type SystemGroup = {
  systemId: number | null;
  systemName: string;
  permissions: PermissionRow[];
};

// Form state สำหรับ Create/Edit
type FormState = {
  permissionCode: string;
  permissionName: string;
  permissionDesc: string;
  status: string;
  systemId: string;
};

const emptyForm: FormState = {
  permissionCode: "",
  permissionName: "",
  permissionDesc: "",
  status: "Y",
  systemId: "",
};

const API_URL = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";

export default function RightsTypePage() {
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // pagination state
  const [page, setPage] = useState(1);
  const limit = 10;
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Expanded systems state
  const [expandedSystems, setExpandedSystems] = useState<Set<number | null>>(
    new Set(),
  );

  // modal state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  // dropdown menu state
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // system options for dropdown
  const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);

  // Filter by system
  const [filterSystemId, setFilterSystemId] = useState<string>("");

  // Fetch permissions from API
  useEffect(() => {
    fetchPermissions();
    fetchSystemOptions();
  }, [page, searchTerm, filterSystemId]);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
        ...(filterSystemId && { system_id: filterSystemId }),
      });

      const response = await fetch(`${API_URL}/iamx/api/permissions/?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch permissions: ${response.statusText}`);
      }

      const result = await response.json();
      setPermissions(result.data || []);
      setTotal(result.total || 0);
      setTotalPages(result.totalPages || 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล",
      );
      console.error("Error fetching permissions:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemOptions = async () => {
    try {
      const response = await fetch(`${API_URL}/iamx/api/systems/`);
      if (!response.ok) {
        throw new Error("Failed to fetch systems");
      }
      const result = await response.json();
      setSystemOptions(result.data || result || []);
    } catch (err) {
      console.error("Error fetching systems:", err);
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

  // Group permissions by system
  const groupedData = useMemo(() => {
    const groups: { [key: string]: SystemGroup } = {};

    permissions.forEach((permission) => {
      const systemId = permission.systemId;
      const systemName = permission.systemName || "ไม่ระบุระบบ";
      const key = systemId ? systemId.toString() : "null";

      if (!groups[key]) {
        groups[key] = {
          systemId: systemId,
          systemName: systemName,
          permissions: [],
        };
      }

      groups[key].permissions.push(permission);
    });

    return Object.values(groups);
  }, [permissions]);

  // Auto-expand all systems when data loads
  useEffect(() => {
    if (groupedData.length > 0) {
      const allSystemIds = groupedData.map((g) => g.systemId);
      setExpandedSystems(new Set(allSystemIds));
    }
  }, [groupedData]);

  // ไม่ต้อง filter ฝั่ง client เพราะ server ทำให้แล้ว
  const filteredGroups = groupedData;

  // Toggle expand/collapse
  const toggleSystem = (systemId: number | null) => {
    setExpandedSystems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(systemId)) {
        newSet.delete(systemId);
      } else {
        newSet.add(systemId);
      }
      return newSet;
    });
  };

  // Expand all
  const expandAll = () => {
    const allSystemIds = groupedData.map((g) => g.systemId);
    setExpandedSystems(new Set(allSystemIds));
  };

  // Collapse all
  const collapseAll = () => {
    setExpandedSystems(new Set());
  };

  const openAddModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setOpen(true);
  };

  const openEditModal = (permission: PermissionRow) => {
    setForm({
      permissionCode: permission.permissionCode || "",
      permissionName: permission.permissionName,
      permissionDesc: permission.permissionDesc || "",
      status: permission.status || "Y",
      systemId: permission.systemId?.toString() || "",
    });
    setEditingId(permission.permissionId);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setForm(emptyForm);
    setEditingId(null);
  };

  const validate = () => {
    if (!form.permissionCode.trim()) return "กรุณาระบุรหัสประเภทสิทธิ์";
    if (!form.permissionName.trim()) return "กรุณาระบุชื่อสิทธิ์";
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
        permission_code: form.permissionCode.trim() || null,
        permission_name: form.permissionName.trim(),
        permission_desc: form.permissionDesc.trim() || null,
        status: form.status || null,
        system_id: form.systemId ? parseInt(form.systemId) : null,
      };

      const isEditing = editingId !== null;
      const url = isEditing
        ? `${API_URL}/iamx/api/permissions/${editingId}`
        : `${API_URL}/iamx/api/permissions/`;
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
            `Failed to ${isEditing ? "update" : "create"} permission`,
        );
      }

      // Refresh the permissions list
      await fetchPermissions();
      closeModal();
      showSuccess(isEditing ? "แก้ไขสำเร็จ" : "เพิ่มสำเร็จ", isEditing ? "แก้ไขสิทธิ์สำเร็จ" : "เพิ่มสิทธิ์สำเร็จ");
    } catch (err) {
      showError("เกิดข้อผิดพลาด", err instanceof Error ? err.message : `เกิดข้อผิดพลาดในการ${editingId !== null ? "แก้ไข" : "เพิ่ม"}สิทธิ์`);
      console.error("Error saving permission:", err);
    }
  };

  const onDelete = async (id: number) => {
    const confirmed = await showConfirm("ยืนยันการลบ", "ยืนยันการลบข้อมูลสิทธิ์นี้?");
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}/iamx/api/permissions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete permission");
      }

      // Refresh the permissions list
      await fetchPermissions();
      showSuccess("ลบสำเร็จ", "ลบสิทธิ์สำเร็จ");
    } catch (err) {
      showError("เกิดข้อผิดพลาด", err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการลบสิทธิ์");
      console.error("Error deleting permission:", err);
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
            <h2 className="text-2xl font-bold">
              ข้อมูลประเภทสิทธิ์ (Rights Type / Permission)
            </h2>
          </div>

          {/* Search and Actions */}
          <div className="p-6">
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 mb-4">
                <div className="flex gap-3 flex-1">
                  <div className="relative flex-1 max-w-md">
                    <Search
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      size={20}
                    />
                    <input
                      type="text"
                      placeholder="ค้นหาสิทธิ์"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                      }}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <select
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]"
                    value={filterSystemId}
                    onChange={(e) => {
                      setFilterSystemId(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">ทุกระบบ</option>
                    {systemOptions.map((system) => (
                      <option key={system.systemId} value={system.systemId}>
                        {system.systemName}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={expandAll}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    ขยายทั้งหมด
                  </button>

                  <button
                    onClick={collapseAll}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    ย่อทั้งหมด
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    onClick={openAddModal}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    <Plus size={20} />
                    เพิ่มสิทธิ์
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

              {/* Table with Expandable Rows */}
              {!loading && !error && (
                <div className="overflow-x-auto">
                  <table className="cds--data-table cds--data-table--sm w-full min-w-[980px]">
                    <thead className="bg-gray-100 border-b-2 border-gray-300">
                      <tr>
                        <th className="p-3 text-left text-sm font-medium w-12"></th>
                        <th className="p-3 text-left text-sm font-medium w-12"></th>
                        <th className="p-3 text-left text-sm font-medium">
                          ลำดับ
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          รหัสสิทธิ์
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          ชื่อสิทธิ์ / ระบบ
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
                      {filteredGroups.map((group, groupIndex) => {
                        const isExpanded = expandedSystems.has(group.systemId);
                        return (
                          <React.Fragment key={group.systemId || "null"}>
                            {/* Parent Row (System) */}
                            <tr className="bg-blue-50 border-b-2 border-blue-200 hover:bg-blue-100">
                              <td className="p-3 text-sm">
                                <button
                                  onClick={() => toggleSystem(group.systemId)}
                                  className="p-1 hover:bg-blue-200 rounded"
                                  title={isExpanded ? "ย่อ" : "ขยาย"}
                                >
                                  {isExpanded ? (
                                    <ChevronDown size={18} />
                                  ) : (
                                    <ChevronRight size={18} />
                                  )}
                                </button>
                              </td>
                              <td className="p-3 text-sm"></td>
                              <td className="p-3 text-sm font-medium">
                                {groupIndex + 1}
                              </td>
                              <td
                                className="p-3 text-sm font-medium"
                                colSpan={2}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-blue-700">
                                    📁 {group.systemName}
                                  </span>
                                  <span className="text-xs bg-blue-200 px-2 py-0.5 rounded-full">
                                    {group.permissions.length} สิทธิ์
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 text-sm"></td>
                              <td className="p-3 text-sm"></td>
                              <td className="p-3 text-sm"></td>
                            </tr>

                            {/* Child Rows (Permissions) */}
                            {isExpanded &&
                              group.permissions.map((permission, permIndex) => (
                                <tr
                                  key={permission.permissionId}
                                  className="border-b hover:bg-gray-50"
                                >
                                  <td className="p-3 text-sm"></td>
                                  <td className="p-3 text-sm">
                                    <div className="relative flex justify-center">
                                      <button
                                        className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                        title="เมนู"
                                        onClick={() =>
                                          setOpenMenuId(
                                            openMenuId ===
                                              permission.permissionId
                                              ? null
                                              : permission.permissionId,
                                          )
                                        }
                                      >
                                        <MoreVertical size={18} />
                                      </button>

                                      {/* Dropdown Menu */}
                                      {openMenuId ===
                                        permission.permissionId && (
                                        <div
                                          ref={dropdownRef}
                                          className="absolute left-full top-0 w-40 bg-white rounded-md shadow-lg border border-gray-200 z-50"
                                        >
                                          <div className="py-1">
                                            <button
                                              onClick={() => {
                                                setOpenMenuId(null);
                                                openEditModal(permission);
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
                                                onDelete(
                                                  permission.permissionId,
                                                );
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
                                  <td className="p-3 text-sm pl-8">
                                    {permIndex + 1}
                                  </td>
                                  <td className="p-3 text-sm font-medium">
                                    {permission.permissionId}
                                  </td>
                                  <td className="p-3 text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-400">└─</span>
                                      {permission.permissionName}
                                    </div>
                                  </td>
                                  <td className="p-3 text-sm text-gray-500">
                                    {permission.permissionDesc || "-"}
                                  </td>
                                  <td className="p-3 text-sm">
                                    <span
                                      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium border ${
                                        permission.status === "Y"
                                          ? "bg-green-50 text-green-700 border-green-200"
                                          : "bg-red-50 text-red-700 border-red-200"
                                      }`}
                                    >
                                      {permission.status === "Y"
                                        ? "เปิดใช้งาน"
                                        : "ปิดใช้งาน"}
                                    </span>
                                  </td>
                                  <td className="p-3 text-sm whitespace-nowrap">
                                    {permission.createDate
                                      ? new Date(
                                          permission.createDate,
                                        ).toLocaleString("th-TH")
                                      : "-"}
                                  </td>
                                </tr>
                              ))}
                          </React.Fragment>
                        );
                      })}

                      {filteredGroups.length === 0 && (
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
                    {editingId !== null ? "แก้ไข" : "เพิ่ม"}ข้อมูลสิทธิ์
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
                      <span className="text-red-500">*</span> รหัสประเภทสิทธิ์
                    </label>
                    <input
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="เช่น 0000 3224"
                      value={form.permissionCode}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          permissionCode: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">
                      <span className="text-red-500">*</span> ชื่อสิทธิ์
                    </label>
                    <input
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="เช่น จัดการผู้ใช้, อนุมัติเอกสาร"
                      value={form.permissionName}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          permissionName: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">คำอธิบาย</label>
                    <textarea
                      className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="คำอธิบายเพิ่มเติม (optional)"
                      rows={3}
                      value={form.permissionDesc}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          permissionDesc: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">
                      <span className="text-red-500">*</span> ระบบ
                    </label>
                    <select
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.systemId}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          systemId: e.target.value,
                        }))
                      }
                    >
                      <option value="">-- เลือกระบบ --</option>
                      {systemOptions.map((system) => (
                        <option key={system.systemId} value={system.systemId}>
                          {system.systemName}
                        </option>
                      ))}
                    </select>
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
                      <option value="Y">เปิดใช้งาน</option>
                      <option value="N">ปิดใช้งาน</option>
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
