"use client";
import { Checkbox } from "@/app/components/iamx/Check";

import ThaiDatePicker from "@/app/components/ThaiDatePicker";
import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  User,
  Shield,
  X,
  ArrowLeft,
  Save,
  Calendar,
} from "lucide-react";

/** ===== API Types ===== */
type UAMRole = {
  id: string;
  name: string;
  code: string;
  description?: string;
  status?: string;
};

type RoleBinding = {
  bindingId: string;
  uamRoleId: string;
  uamRoleName: string;
  uamRoleCode: string;
  uamRoleStatus?: string;
};

type IAMXRole = {
  roleId: string;
  roleName: string;
  roleDesc?: string;
  bindingCount?: number;
  bindings?: RoleBinding[];
};

type AgencyTypeOption = {
  value: string;
  label: string;
};

type AgencyOption = {
  id: string;
  name: string;
  type: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

const norm = (s: any) =>
  String(s ?? "")
    .trim()
    .toLowerCase();

/** ===== Modal Component ===== */
function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl border border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="font-semibold text-gray-800">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function ManagePermissionPage() {
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedBindingId, setSelectedBindingId] = useState<string | null>(
    null,
  );

  const [roleSearch, setRoleSearch] = useState("");

  const [iamxRoles, setIamxRoles] = useState<IAMXRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [openBindingModal, setOpenBindingModal] = useState(false);
  const [uamRoles, setUamRoles] = useState<UAMRole[]>([]);
  const [uamLoading, setUamLoading] = useState(false);
  const [uamError, setUamError] = useState("");

  const [selectedUamRoleIds, setSelectedUamRoleIds] = useState<Set<string>>(
    new Set(),
  );
  const [modalSearch, setModalSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string>("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Form state for ROLE_MANAGE_AGENCY
  const [formAgencyType, setFormAgencyType] = useState<string>("");
  const [formAgencyId, setFormAgencyId] = useState<string>("");
  const [formStartDate, setFormStartDate] = useState<string>("");
  const [formEndDate, setFormEndDate] = useState<string>("");
  const [formStatus, setFormStatus] = useState<string>("ACTIVE");
  const [formPermissionData, setFormPermissionData] = useState<string>("");

  // Agency options
  const [agencyTypeOptions, setAgencyTypeOptions] = useState<
    AgencyTypeOption[]
  >([]);
  const [agencyOptions, setAgencyOptions] = useState<AgencyOption[]>([]);
  const [loadingAgencies, setLoadingAgencies] = useState(false);

  /** ===== Load IAMX Roles with bindings ===== */
  const loadIAMXRoles = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/iamx/api/manage-permission/roles`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Failed to load IAMX roles: ${res.status} ${t}`);
      }
      const rawData: any[] = await res.json();

      // แปลงข้อมูลจาก API format เป็น frontend format
      const data: IAMXRole[] = (rawData || []).map((role) => ({
        roleId: String(role.roleId || ""),
        roleName: role.roleName || "",
        roleDesc: role.roleDesc || "",
        bindingCount: (role.uamRoles || []).length,
        bindings: (role.uamRoles || []).map((uam: any) => ({
          bindingId: uam.roleManageId || "",
          uamRoleId: String(uam.roleUam || ""),
          uamRoleName: uam.uamRoleName || "",
          uamRoleCode: "",
          uamRoleStatus: "",
        })),
      }));

      setIamxRoles(data);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  /** ===== Load UAM Roles ===== */
  const loadUAMRoles = async () => {
    setUamLoading(true);
    setUamError("");
    try {
      const res = await fetch(`${API_BASE}/iamx/api/manage-permission/uam-roles`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Failed to load UAM roles: ${res.status} ${t}`);
      }
      const rawData: any[] = await res.json();

      const data: UAMRole[] = (rawData || []).map((role) => ({
        id: String(role.roleId || ""),
        name: role.roleName || "",
        code: String(role.roleId || ""),
        description: role.roleDesc || "",
        status: "active",
      }));

      setUamRoles(data);
    } catch (err: any) {
      setUamError(err.message || "Unknown error");
    } finally {
      setUamLoading(false);
    }
  };

  /** ===== Load Agency Type Options ===== */
  const loadAgencyTypeOptions = async () => {
    try {
      const res = await fetch(`${API_BASE}/iamx/api/agency-type-options`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Failed to load agency type options");
      }
      const data: AgencyTypeOption[] = await res.json();
      setAgencyTypeOptions(data);
    } catch (err: any) {
      console.error("Error loading agency type options:", err);
    }
  };

  /** ===== Load Agency Options by Type ===== */
  const loadAgencyOptions = async (type: string) => {
    if (!type) {
      setAgencyOptions([]);
      return;
    }

    setLoadingAgencies(true);
    try {
      const res = await fetch(
        `${API_BASE}/iamx/api/agency-options?type=${encodeURIComponent(type)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );
      if (!res.ok) {
        throw new Error("Failed to load agency options");
      }
      const rawData: any[] = await res.json();
      const data: AgencyOption[] = (rawData || []).map((item) => ({
        id: item.id || "",
        name: item.name || "",
        type: item.type || "",
      }));
      setAgencyOptions(data);
    } catch (err: any) {
      console.error("Error loading agency options:", err);
      setAgencyOptions([]);
    } finally {
      setLoadingAgencies(false);
    }
  };

  /** ===== Save bindings ===== */
  const saveBindings = async () => {
    if (!selectedRole) return;
    setSaving(true);
    setSaveMsg("");

    try {
      const roleUams = Array.from(selectedUamRoleIds).map((id) => parseInt(id));
      const res = await fetch(
        `${API_BASE}/iamx/api/manage-permission/roles/${selectedRole}/bindings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleUams,
            createdBy: "SYSTEM",
          }),
        },
      );

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Failed to save bindings: ${res.status} ${t}`);
      }

      setSaveMsg("บันทึกสำเร็จ");
      setOpenBindingModal(false);
      await loadIAMXRoles();
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  /** ===== Save Agency Data ===== */
  const saveAgencyData = async () => {
    if (!selectedBindingId) return;

    // Validate required fields
    if (!formAgencyType) {
      setSaveMsg("Error: กรุณาเลือกประเภทระดับหน่วยงาน");
      return;
    }
    if (!formAgencyId) {
      setSaveMsg("Error: กรุณาเลือกหน่วยงาน");
      return;
    }
    if (!formStartDate) {
      setSaveMsg("Error: กรุณาเลือกวันที่เริ่มใช้งาน");
      return;
    }

    setSaving(true);
    setSaveMsg("");

    try {
      const res = await fetch(`${API_BASE}/iamx/api/manage-permission/agencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleManageId: selectedBindingId,
          roleAgcType: formAgencyType,
          roleAgcId: formAgencyId,
          effectiveDate: formStartDate,
          expireDate: formEndDate || null,
          status: formStatus,
          permissionData: formPermissionData || null,
          createdBy: "SYSTEM",
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Failed to save agency data: ${res.status} ${t}`);
      }

      setSaveMsg("บันทึกสำเร็จ");
      // Reset form
      setFormAgencyType("");
      setFormAgencyId("");
      setFormStartDate("");
      setFormEndDate("");
      setFormStatus("ACTIVE");
      setFormPermissionData("");
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  /** ===== Open binding modal ===== */
  const openBindingModalHandler = async () => {
    if (!selectedRole) return;

    setOpenBindingModal(true);
    setSaveMsg("");
    setModalSearch("");

    const role = iamxRoles.find((r) => r.roleId === selectedRole);
    if (role) {
      const currentBindings = new Set(
        (role.bindings || []).map((b) => b.uamRoleId),
      );
      setSelectedUamRoleIds(currentBindings);
    }

    if (uamRoles.length === 0) {
      await loadUAMRoles();
    }
  };

  /** ===== Initial load ===== */
  useEffect(() => {
    loadIAMXRoles();
    loadAgencyTypeOptions();
  }, []);

  /** ===== Reset pagination when search changes ===== */
  useEffect(() => {
    setCurrentPage(1);
  }, [roleSearch]);

  /** ===== Load agencies when agency type changes ===== */
  useEffect(() => {
    if (formAgencyType) {
      loadAgencyOptions(formAgencyType);
      // Reset agency ID when type changes
      setFormAgencyId("");
    }
  }, [formAgencyType]);

  /** ===== Filtered IAMX Roles ===== */
  const filteredIAMXRoles = useMemo(() => {
    if (!roleSearch.trim()) return iamxRoles;
    const q = roleSearch.toLowerCase().trim();
    return iamxRoles.filter((r) => {
      const name = norm(r.roleName);
      const desc = norm(r.roleDesc || "");
      return name.includes(q) || desc.includes(q);
    });
  }, [iamxRoles, roleSearch]);

  /** ===== Pagination ===== */
  const totalPages = Math.ceil(filteredIAMXRoles.length / itemsPerPage);
  const paginatedRoles = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredIAMXRoles.slice(start, end);
  }, [filteredIAMXRoles, currentPage, itemsPerPage]);

  /** ===== Selected role data ===== */
  const selectedRoleData = useMemo(() => {
    return iamxRoles.find((r) => r.roleId === selectedRole);
  }, [iamxRoles, selectedRole]);

  /** ===== Selected UAM Role binding data ===== */
  const selectedBindingData = useMemo(() => {
    if (!selectedRoleData || !selectedBindingId) return null;
    return (selectedRoleData.bindings || []).find(
      (b) => b.bindingId === selectedBindingId,
    );
  }, [selectedRoleData, selectedBindingId]);

  /** ===== Populate form data when UAM Role is selected ===== */
  useEffect(() => {
    if (selectedBindingData) {
      // Reset form when selecting new binding
      setFormAgencyType("");
      setFormAgencyId("");
      setFormStartDate("");
      setFormEndDate("");
      setFormStatus("ACTIVE");
      setFormPermissionData("");
    } else {
      // Reset form
      setFormAgencyType("");
      setFormAgencyId("");
      setFormStartDate("");
      setFormEndDate("");
      setFormStatus("ACTIVE");
      setFormPermissionData("");
    }
  }, [selectedBindingData]);

  /** ===== Filtered UAM Roles in modal ===== */
  const filteredUAMRoles = useMemo(() => {
    if (!modalSearch.trim()) return uamRoles;
    const q = modalSearch.toLowerCase().trim();
    return uamRoles.filter((r) => {
      const name = norm(r.name);
      const code = norm(r.code);
      const desc = norm(r.description || "");
      return name.includes(q) || code.includes(q) || desc.includes(q);
    });
  }, [uamRoles, modalSearch]);

  /** ===== Toggle UAM role selection ===== */
  const toggleUAMRole = (roleId: string) => {
    setSelectedUamRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            จัดการบงบาทหลัก (Main Role Management)
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            ผูก IAMX Role กับ UAM Role
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {saveMsg && (
          <div
            className={`mb-4 p-3 rounded-lg border text-sm ${
              saveMsg.startsWith("Error")
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {saveMsg}
          </div>
        )}

        <div className="flex gap-6">
          {/* LEFT PANEL - IAMX Roles List (50%) */}
          <div className="w-1/2 bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="ค้นหา IAMX Role"
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="bg-blue-500 text-white px-4 py-3 flex items-center gap-2">
              <Shield size={18} />
              <span className="font-medium">IAMX Roles</span>
              <span className="ml-2 px-2 py-0.5 bg-white text-blue-600 rounded text-xs font-bold">
                {filteredIAMXRoles.length}
              </span>
            </div>

            <div className="p-4 max-h-[calc(100vh-300px)] overflow-y-auto">
              {loading && (
                <div className="text-center text-gray-500 py-10">
                  กำลังโหลดข้อมูล...
                </div>
              )}
              {!loading && filteredIAMXRoles.length === 0 && (
                <div className="text-center text-gray-500 py-10">
                  ไม่พบข้อมูล
                </div>
              )}

              {!loading &&
                paginatedRoles.map((role) => (
                  <div key={role.roleId} className="mb-3">
                    <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition">
                      {/* Chevron - เปิด/ปิด children */}
                      <div
                        onClick={() =>
                          setExpandedRoles((prev) => {
                            const next = new Set(prev);
                            if (next.has(role.roleId)) {
                              next.delete(role.roleId);
                            } else {
                              next.add(role.roleId);
                            }
                            return next;
                          })
                        }
                      >
                        {expandedRoles.has(role.roleId) ? (
                          <ChevronDown size={18} className="text-blue-600" />
                        ) : (
                          <ChevronRight size={18} className="text-gray-600" />
                        )}
                      </div>

                      {/* Role Name - เลือก role และ expand */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRole(role.roleId);
                          setSelectedBindingId(null);
                          setExpandedRoles((prev) => {
                            const next = new Set(prev);
                            next.add(role.roleId);
                            return next;
                          });
                        }}
                        className={`flex-1 cursor-pointer ${
                          selectedRole === role.roleId && !selectedBindingId
                            ? "font-bold text-blue-600"
                            : "text-gray-700"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="font-semibold">{role.roleName}</div>

                          {/* ปุ่มจัดการการผูก */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title="จัดการการผูก"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRole(role.roleId);
                                openBindingModalHandler();
                              }}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
                            >
                              <Plus size={14} />
                            </button>
                          </div>

                          <div className="flex-1" />
                        </div>

                        <div className="text-xs text-gray-500 mt-0.5">
                          roleId: {role.roleId}
                        </div>

                        {role.roleDesc && (
                          <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {role.roleDesc}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Show UAM Role bindings when expanded */}
                    {expandedRoles.has(role.roleId) && (
                      <div className="ml-8 mt-2 rounded-lg border border-gray-200 bg-white p-2">
                        {!role.bindings || role.bindings.length === 0 ? (
                          <div className="text-sm text-gray-500 py-3 px-2">
                            ไม่มี UAM Role ที่ผูกกับ IAMX Role นี้
                          </div>
                        ) : (
                          role.bindings.map((binding) => (
                            <div
                              key={binding.bindingId}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRole(role.roleId);
                                setSelectedBindingId(binding.bindingId);
                              }}
                              className={`flex items-center gap-2 p-2 rounded-lg mb-1 cursor-pointer transition ${
                                selectedBindingId === binding.bindingId
                                  ? "bg-blue-100 border-l-4 border-l-blue-600 font-semibold"
                                  : "hover:bg-gray-50"
                              }`}
                            >
                              <User
                                size={16}
                                className={
                                  selectedBindingId === binding.bindingId
                                    ? "text-blue-600"
                                    : "text-gray-500"
                                }
                              />
                              <div className="flex-1">
                                <div
                                  className={`text-sm ${
                                    selectedBindingId === binding.bindingId
                                      ? "text-blue-700 font-semibold"
                                      : "text-gray-700"
                                  }`}
                                >
                                  {binding.uamRoleName}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  ID: {binding.uamRoleId}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>

            {/* Pagination */}
            {!loading && filteredIAMXRoles.length > 0 && (
              <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  แสดง {(currentPage - 1) * itemsPerPage + 1} -{" "}
                  {Math.min(
                    currentPage * itemsPerPage,
                    filteredIAMXRoles.length,
                  )}{" "}
                  จาก {filteredIAMXRoles.length} รายการ
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    ก่อนหน้า
                  </button>

                  {(() => {
                    const maxVisible = 5;
                    const pages: (number | string)[] = [];

                    if (totalPages <= maxVisible + 2) {
                      for (let i = 1; i <= totalPages; i++) {
                        pages.push(i);
                      }
                    } else {
                      pages.push(1);

                      let start = Math.max(2, currentPage - 1);
                      let end = Math.min(totalPages - 1, currentPage + 1);

                      if (currentPage <= 3) {
                        end = maxVisible - 1;
                      } else if (currentPage >= totalPages - 2) {
                        start = totalPages - (maxVisible - 2);
                      }

                      if (start > 2) pages.push("...");

                      for (let i = start; i <= end; i++) {
                        pages.push(i);
                      }

                      if (end < totalPages - 1) pages.push("...");

                      pages.push(totalPages);
                    }

                    return pages.map((page, idx) =>
                      typeof page === "number" ? (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 rounded border text-sm ${
                            currentPage === page
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {page}
                        </button>
                      ) : (
                        <span key={idx} className="px-2 text-gray-500">
                          {page}
                        </span>
                      ),
                    );
                  })()}

                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANEL - Agency Form (50%) */}
          <div className="w-1/2 bg-white rounded-lg shadow">
            {!selectedRole || !selectedBindingId ? (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                กรุณาเลือก UAM Role (ลูก) เพื่อจัดการข้อมูลหน่วยงาน
              </div>
            ) : (
              <>
                {/* Header - Form Actions */}
                <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-blue-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
                        <Shield size={24} className="text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-800">
                          จัดการข้อมูลหน่วยงาน
                        </h2>
                        <div className="text-xs text-gray-600 mt-1">
                          กำหนดระดับหน่วยงานและวันที่มีผลบังคับใช้
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedBindingId(null);
                          setSelectedRole("");
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition"
                        title="ย้อนกลับ"
                      >
                        <ArrowLeft size={18} />
                        ย้อนกลับ
                      </button>
                      <button
                        onClick={saveAgencyData}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50"
                        title="บันทึก"
                      >
                        <Save size={18} />
                        {saving ? "กำลังบันทึก..." : "บันทึก"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Body - Editable Form */}
                <div className="p-6 overflow-y-auto max-h-[calc(100vh-200px)]">
                  <div className="space-y-6">
                    {/* ประเภทระดับหน่วยงาน - Dropdown */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        ประเภทระดับหน่วยงาน
                        <span className="text-red-500 ml-1">*</span>
                      </label>
                      <select
                        value={formAgencyType}
                        onChange={(e) => setFormAgencyType(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                      >
                        <option value="">-- เลือกประเภทหน่วยงาน --</option>
                        {agencyTypeOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* หน่วยงาน - Dropdown */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        หน่วยงาน
                        <span className="text-red-500 ml-1">*</span>
                      </label>
                      <select
                        value={formAgencyId}
                        onChange={(e) => setFormAgencyId(e.target.value)}
                        disabled={!formAgencyType || loadingAgencies}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white disabled:bg-gray-100"
                      >
                        <option value="">
                          {loadingAgencies
                            ? "กำลังโหลด..."
                            : "-- เลือกหน่วยงาน --"}
                        </option>
                        {agencyOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                      {!formAgencyType && (
                        <div className="mt-1 text-xs text-gray-500">
                          กรุณาเลือกประเภทหน่วยงานก่อน
                        </div>
                      )}
                    </div>

                    {/* วันที่ - Date Pickers */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          วันที่เริ่มต้นใช้งาน
                          <span className="text-red-500 ml-1">*</span>
                        </label>
                        <div className="relative">
                          <Calendar
                            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                            size={18}
                          />
                          <ThaiDatePicker
                            value={formStartDate}
                            onChange={setFormStartDate}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          วันที่สิ้นสุดใช้งาน
                        </label>
                        <div className="relative">
                          <Calendar
                            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                            size={18}
                          />
                          <ThaiDatePicker
                            value={formEndDate}
                            onChange={setFormEndDate}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* สถานะ - Dropdown */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        สถานะ
                      </label>
                      <select
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                      >
                        <option value="ACTIVE">ACTIVE (ใช้งาน)</option>
                        <option value="INACTIVE">INACTIVE (ไม่ใช้งาน)</option>
                      </select>
                      <div className="mt-2">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                            formStatus === "ACTIVE"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {formStatus}
                        </span>
                      </div>
                    </div>

                    {/* ข้อมูลสิทธิการเข้าถึง - Textarea */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        ข้อมูลสิทธิการเข้าถึงข้อมูล (PERMISSION_DATA)
                      </label>
                      <textarea
                        value={formPermissionData}
                        onChange={(e) => setFormPermissionData(e.target.value)}
                        rows={4}
                        placeholder="ข้อมูลเพิ่มเติมเกี่ยวกับสิทธิ์..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>

                    {/* Info Box */}
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-blue-900 mb-1">
                            ข้อมูลการผูก
                          </h4>
                          <p className="text-sm text-blue-800">
                            IAMX Role:{" "}
                            <span className="font-semibold">
                              {selectedRoleData?.roleName}
                            </span>
                            <br />
                            UAM Role:{" "}
                            <span className="font-semibold">
                              {selectedBindingData?.uamRoleName}
                            </span>
                            <br />
                            Binding ID:{" "}
                            <span className="font-mono text-xs">
                              {selectedBindingId}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal for selecting UAM Roles */}
      <Modal
        open={openBindingModal}
        title="เลือก UAM Roles เพื่อผูกกับ IAMX Role"
        onClose={() => setOpenBindingModal(false)}
      >
        <div className="mb-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="ค้นหา UAM Role (ชื่อ, รหัส, คำอธิบาย)"
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        {uamError && (
          <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            {uamError}
          </div>
        )}

        <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-lg">
          {uamLoading && (
            <div className="text-center text-gray-500 py-10">
              กำลังโหลด UAM Roles...
            </div>
          )}
          {!uamLoading && filteredUAMRoles.length === 0 && (
            <div className="text-center text-gray-500 py-10">
              ไม่พบ UAM Role
            </div>
          )}

          {!uamLoading &&
            filteredUAMRoles.map((role) => (
              <div
                key={role.id}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                onClick={() => toggleUAMRole(role.id)}
              >
                <Checkbox
                  
                  checked={selectedUamRoleIds.has(role.id)}
                  onChange={() => toggleUAMRole(role.id)}
                  className="h-4 w-4"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1">
                  <div className="font-semibold text-sm text-gray-800">
                    {role.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Code: {role.code}
                  </div>
                  {role.description && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {role.description}
                    </div>
                  )}
                </div>
                {role.status && (
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      role.status.toUpperCase() === "ACTIVE"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {role.status}
                  </span>
                )}
              </div>
            ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            เลือกแล้ว: {selectedUamRoleIds.size} รายการ
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOpenBindingModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
            >
              ยกเลิก
            </button>
            <button
              onClick={saveBindings}
              disabled={saving}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
