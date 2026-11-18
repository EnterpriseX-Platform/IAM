"use client";
import { Checkbox } from "@/app/components/iamx/Check";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle,
  XCircle,
  Save,
  Download,
} from "lucide-react";
import { showSuccess, showError, showConfirm } from "@/lib/swal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

type UserInfo = {
  userId?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  status?: string | null;
};

type Role = {
  roleId: string;
  roleName: string;
  roleDesc?: string | null;
  systemId?: number;
};

type RoleWithPoliciesResponse = {
  roleId: string;
  roleName: string;
  roleDesc?: string | null;
  systemId?: number;
  policies?: any[];
};

type RoleAssignment = {
  [userId: number]: {
    [roleId: string]: boolean;
  };
};

export default function UserInfoPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Tab state
  const [activeTab, setActiveTab] = useState<"list" | "matrix">("list");

  // Matrix tab states
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment>({});
  const [matrixSearchQuery, setMatrixSearchQuery] = useState("");

  // Matrix pagination
  const [matrixPage, setMatrixPage] = useState(1);
  const matrixLimit = 10;

  // Pagination states
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);

  // Load users from API
  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/iamx/api/user-info`);
      if (!response.ok) throw new Error("Failed to fetch users");
      const data = await response.json();
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await fetch(`${API_BASE}/iamx/api/role/`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch roles");
      }

      const data: RoleWithPoliciesResponse[] = await response.json();

      // Transform API response to Role type
      const transformedRoles: Role[] = data.map((role) => ({
        roleId: role.roleId,
        roleName: role.roleName,
        roleDesc: role.roleDesc,
        systemId: role.systemId,
      }));

      setRoles(transformedRoles);

      // Initialize empty assignments
      const initialAssignments: RoleAssignment = {};
      setRoleAssignments(initialAssignments);
    } catch (error) {
      console.error("Error fetching roles:", error);
      // Fallback to empty array on error
      setRoles([]);
    }
  };

  // Filtered users based on search and status
  const filteredUsers = useMemo(() => {
    let result = users;

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((user) => {
        if (statusFilter === "active") return user.status === "active";
        if (statusFilter === "inactive") return user.status !== "active";
        return true;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((user) => {
        const fullName =
          `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
        const email = (user.email || "").toLowerCase();
        const userId = (user.userId || "").toString();
        return (
          fullName.includes(query) ||
          email.includes(query) ||
          userId.includes(query)
        );
      });
    }

    return result;
  }, [users, searchQuery, statusFilter]);

  // Pagination calculations
  const totalUsers = filteredUsers.length;
  const totalPages = Math.ceil(totalUsers / limit);

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * limit;
    const end = start + limit;
    return filteredUsers.slice(start, end);
  }, [filteredUsers, page, limit]);

  // Reset page when search/filter changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  // Handle delete user
  const handleDeleteUser = async () => {
    try {
      // TODO: Implement actual API call when backend is ready
      console.log("Delete user:", selectedUser?.userId);

      // Mock success
      showSuccess("สำเร็จ", "ลบผู้ใช้สำเร็จ");
      setShowDeleteConfirm(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      showError("ผิดพลาด", "เกิดข้อผิดพลาดในการลบผู้ใช้");
    }
  };

  const openDeleteConfirm = (user: UserInfo) => {
    setSelectedUser(user);
    setShowDeleteConfirm(true);
  };

  // Matrix functions
  const filteredMatrixUsers = useMemo(() => {
    if (!matrixSearchQuery.trim()) return users;

    const query = matrixSearchQuery.toLowerCase();
    return users.filter((user) => {
      const fullName =
        `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
      const email = (user.email || "").toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  }, [users, matrixSearchQuery]);

  // Matrix pagination
  const totalMatrixUsers = filteredMatrixUsers.length;
  const totalMatrixPages = Math.ceil(totalMatrixUsers / matrixLimit);

  const paginatedMatrixUsers = useMemo(() => {
    const start = (matrixPage - 1) * matrixLimit;
    const end = start + matrixLimit;
    return filteredMatrixUsers.slice(start, end);
  }, [filteredMatrixUsers, matrixPage, matrixLimit]);

  // Reset matrix page when search changes
  useEffect(() => {
    setMatrixPage(1);
  }, [matrixSearchQuery]);

  const toggleRoleAssignment = (userId: number, roleId: string) => {
    setRoleAssignments((prev) => {
      const userAssignments = prev[userId] || {};
      const newValue = !userAssignments[roleId];

      return {
        ...prev,
        [userId]: {
          ...userAssignments,
          [roleId]: newValue,
        },
      };
    });
  };

  const toggleAllUsersForRole = (roleId: string) => {
    setRoleAssignments((prev) => {
      const newAssignments = { ...prev };
      // Check ทุกคนใน filteredMatrixUsers ไม่ใช่แค่ current page
      const allChecked = filteredMatrixUsers.every(
        (user) => prev[user.userId!]?.[roleId],
      );

      // Toggle ทุกคนไม่ว่าจะอยู่หน้าไหน
      filteredMatrixUsers.forEach((user) => {
        if (!newAssignments[user.userId!]) {
          newAssignments[user.userId!] = {};
        }
        newAssignments[user.userId!][roleId] = !allChecked;
      });

      return newAssignments;
    });
  };

  const isRoleFullyChecked = (roleId: string) => {
    // Check ว่าทุกคนใน filteredMatrixUsers ถูก check หรือไม่
    return (
      filteredMatrixUsers.length > 0 &&
      filteredMatrixUsers.every(
        (user) => roleAssignments[user.userId!]?.[roleId],
      )
    );
  };

  const getRoleCheckedCount = (roleId: string) => {
    // นับจำนวน user ที่ถูก check ใน role นี้ (ทุกหน้า)
    return filteredMatrixUsers.filter(
      (user) => roleAssignments[user.userId!]?.[roleId],
    ).length;
  };

  const handleSaveMatrix = () => {
    console.log("Saving role assignments:", roleAssignments);
    showSuccess("สำเร็จ", "บันทึกสำเร็จ");
  };

  const handleExportMatrix = () => {
    console.log("Exporting matrix data");
    showSuccess("สำเร็จ", "ส่งออกข้อมูลสำเร็จ");
  };

  const handleCancelMatrix = async () => {
    const ok = await showConfirm("ยืนยัน", "คุณต้องการยกเลิกการเปลี่ยนแปลงหรือไม่?");
    if (ok) {
      fetchRoles(); // Reset to original state
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shrink-0">
          <h1 className="text-2xl font-bold text-gray-800">ข้อมูลผู้ใช้งาน</h1>
          {activeTab === "list" && (
            <button
              onClick={() => router.push("/settings/userInfo/add")}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              เพิ่มผู้ใช้
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200 shrink-0">
          <div className="flex px-6">
            <button
              onClick={() => setActiveTab("list")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors relative flex items-center justify-center gap-1.5 ${
                activeTab === "list"
                  ? "text-[#3D56D4] border-b-2 border-[#3D56D4]"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === "list" ? "bg-[#3D56D4]" : "bg-[#D0D0D4]"}`} />
              <span className="truncate">รายการผู้ใช้งาน</span>
              {activeTab === "list" && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {totalUsers}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("matrix")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors relative flex items-center justify-center gap-1.5 ${
                activeTab === "matrix"
                  ? "text-[#3D56D4] border-b-2 border-[#3D56D4]"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === "matrix" ? "bg-[#3D56D4]" : "bg-[#D0D0D4]"}`} />
              <span className="truncate">Matrix การมอบหมายบทบาท</span>
            </button>
          </div>
        </div>

        {/* Tab Content: User List */}
        {activeTab === "list" && (
          <>
            {/* Search and Filter Bar */}
            <div className="bg-white border-b border-gray-200 p-6 shrink-0">
              <div className="flex items-center gap-4">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="ค้นหา ชื่อ, อีเมล, USER_ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="active">ใช้งาน</option>
                  <option value="inactive">ไม่ใช้งาน</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white flex-1 overflow-auto">
              {loading ? (
                <div className="p-8 text-center text-gray-500">
                  กำลังโหลดข้อมูล...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  ไม่พบข้อมูลผู้ใช้
                </div>
              ) : (
                <>
                  <table className="cds--data-table cds--data-table--sm w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                          ชื่อผู้ใช้ / นามสกุล
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                          อีเมล
                        </th>
                        <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                          สถานะ
                        </th>
                        <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                          จัดการ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {paginatedUsers.map((user, index) => (
                        <tr
                          key={user.userId || index}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-medium text-gray-900">
                                {user.firstName} {user.lastName}
                              </div>
                              <div className="text-sm text-gray-500">
                                USER_ID: {user.userId || "-"}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {user.email || "-"}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              {user.status === "active" ? (
                                <>
                                  <CheckCircle className="w-5 h-5 text-green-500" />
                                  <span className="text-sm text-green-700">
                                    ใช้งาน
                                  </span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-5 h-5 text-red-500" />
                                  <span className="text-sm text-red-700">
                                    ไม่ใช้งาน
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() =>
                                  router.push(
                                    `/settings/userInfo/edit/${user.userId}`,
                                  )
                                }
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="แก้ไข"
                              >
                                <Pencil className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => openDeleteConfirm(user)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="ลบ"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t">
                      <div className="text-sm text-gray-700">
                        แสดง {(page - 1) * limit + 1} ถึง{" "}
                        {Math.min(page * limit, totalUsers)} จาก {totalUsers}{" "}
                        รายการ
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
                </>
              )}
            </div>
          </>
        )}

        {/* Tab Content: Matrix */}
        {activeTab === "matrix" && (
          <div className="bg-white flex-1 flex flex-col overflow-hidden">
            {/* Matrix Header Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 bg-white">
              {/* Search */}
              <div className="flex-1 max-w-md relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="ค้นหาผู้ใช้..."
                  value={matrixSearchQuery}
                  onChange={(e) => setMatrixSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveMatrix}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <Save className="w-4 h-4" />
                  บันทึก
                </button>
                <button
                  onClick={handleExportMatrix}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <Download className="w-4 h-4" />
                  ส่งออกข้อมูล
                </button>
                <button
                  onClick={handleCancelMatrix}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium"
                >
                  <X className="w-4 h-4" />
                  ยกเลิก
                </button>
              </div>
            </div>

            {/* Matrix Table Container */}
            <div className="flex-1 overflow-auto border-x border-gray-200">
              <div className="inline-block min-w-full align-middle">
                <table className="cds--data-table cds--data-table--sm min-w-full border-collapse bg-white">
                  {/* Table Header */}
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {/* Sticky First Column Header */}
                      <th className="sticky left-0 z-20 bg-gray-100 border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700 min-w-[200px]">
                        ผู้ใช้งาน
                      </th>

                      {/* Role Headers */}
                      {roles.map((role) => {
                        const checkedCount = getRoleCheckedCount(role.roleId);
                        const totalCount = filteredMatrixUsers.length;

                        return (
                          <th
                            key={role.roleId}
                            className="relative bg-gray-100 border border-gray-300 px-2 py-2 min-w-[80px] max-w-[80px]"
                          >
                            <div className="flex flex-col items-center justify-center h-32">
                              {/* Column Select Checkbox */}
                              <Checkbox
                                
                                checked={isRoleFullyChecked(role.roleId)}
                                onChange={() =>
                                  toggleAllUsersForRole(role.roleId)
                                }
                                className="mb-2 w-4 h-4 cursor-pointer"
                                title={`เลือก/ยกเลิกทั้งหมด (${checkedCount}/${totalCount})`}
                              />

                              {/* Rotated Role Name */}
                              <div
                                className="whitespace-nowrap text-sm font-medium text-gray-700"
                                style={{
                                  writingMode: "vertical-rl",
                                  transform: "rotate(180deg)",
                                }}
                              >
                                {role.roleName}
                              </div>

                              {/* Count: checked / total */}
                              <div
                                className="text-xs text-gray-500 mt-2"
                                style={{
                                  writingMode: "vertical-rl",
                                  transform: "rotate(180deg)",
                                }}
                              >
                                {checkedCount}/{totalCount}
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  {/* Table Body */}
                  <tbody>
                    {paginatedMatrixUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={roles.length + 1}
                          className="text-center py-8 text-gray-500"
                        >
                          ไม่พบข้อมูลผู้ใช้
                        </td>
                      </tr>
                    ) : (
                      paginatedMatrixUsers.map((user) => (
                        <tr key={user.userId} className="hover:bg-gray-50">
                          {/* Sticky First Column - User Name */}
                          <td className="sticky left-0 z-10 bg-white border border-gray-300 px-4 py-3 hover:bg-gray-50">
                            <div>
                              <div className="font-medium text-gray-900">
                                {user.firstName} {user.lastName}
                              </div>
                              <div className="text-xs text-gray-500">
                                {user.email}
                              </div>
                            </div>
                          </td>

                          {/* Role Assignment Checkboxes */}
                          {roles.map((role) => (
                            <td
                              key={role.roleId}
                              className="border border-gray-300 text-center bg-white"
                            >
                              <Checkbox
                                
                                checked={
                                  roleAssignments[user.userId!]?.[
                                    role.roleId
                                  ] || false
                                }
                                onChange={() =>
                                  toggleRoleAssignment(
                                    user.userId!,
                                    role.roleId,
                                  )
                                }
                                className="w-4 h-4 cursor-pointer"
                              />
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Matrix Pagination */}
            {totalMatrixPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
                <div className="text-sm text-gray-700">
                  แสดง {(matrixPage - 1) * matrixLimit + 1} ถึง{" "}
                  {Math.min(matrixPage * matrixLimit, totalMatrixUsers)} จาก{" "}
                  {totalMatrixUsers} รายการ
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMatrixPage(1)}
                    disabled={matrixPage === 1}
                    className="px-3 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    แรก
                  </button>
                  <button
                    onClick={() => setMatrixPage((p) => Math.max(1, p - 1))}
                    disabled={matrixPage === 1}
                    className="px-3 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    ก่อนหน้า
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from(
                      { length: Math.min(5, totalMatrixPages) },
                      (_, i) => {
                        let pageNum;
                        if (totalMatrixPages <= 5) {
                          pageNum = i + 1;
                        } else if (matrixPage <= 3) {
                          pageNum = i + 1;
                        } else if (matrixPage >= totalMatrixPages - 2) {
                          pageNum = totalMatrixPages - 4 + i;
                        } else {
                          pageNum = matrixPage - 2 + i;
                        }

                        return (
                          <button
                            key={i}
                            onClick={() => setMatrixPage(pageNum)}
                            className={`px-3 py-1 rounded text-sm ${
                              matrixPage === pageNum
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
                      setMatrixPage((p) => Math.min(totalMatrixPages, p + 1))
                    }
                    disabled={matrixPage === totalMatrixPages}
                    className="px-3 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    ถัดไป
                  </button>
                  <button
                    onClick={() => setMatrixPage(totalMatrixPages)}
                    disabled={matrixPage === totalMatrixPages}
                    className="px-3 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    สุดท้าย
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">ยืนยันการลบ</h2>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              คุณต้องการลบผู้ใช้{" "}
              <span className="font-semibold">
                {selectedUser.firstName} {selectedUser.lastName}
              </span>{" "}
              ใช่หรือไม่?
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDeleteUser}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
