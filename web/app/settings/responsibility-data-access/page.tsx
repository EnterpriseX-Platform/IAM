"use client";

import ThaiDatePicker from "@/app/components/ThaiDatePicker";
import { showConfirm } from "@/lib/swal";
import {
  Calendar,
  CheckCircle2,
  Database,
  Edit2,
  Filter,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

interface ResponsibilityDataAccess {
  id: number;
  responsibility_id: number;
  object_id: number;
  access_level: string;
  scope_filter?: string;
  effective_date?: string;
  expire_date?: string;
  is_active: number;
  responsibility_code?: string;
  responsibility_name?: string;
  object_code?: string;
  object_name?: string;
  object_path?: string;
}

interface Responsibility {
  id: number;
  code: string;
  name: string;
  is_active: number;
}

interface ObjectItem {
  value: number;
  label: string;
}

interface GeoOption {
  id: string;
  name: string;
}

const ACCESS_LEVELS = [
  { value: "READ", label: "Read", color: "bg-blue-100 text-blue-700" },
  { value: "WRITE", label: "Write", color: "bg-emerald-100 text-emerald-700" },
  { value: "DELETE", label: "Delete", color: "bg-red-100 text-red-700" },
  { value: "ADMIN", label: "Admin", color: "bg-purple-100 text-purple-700" },
];

export default function ResponsibilityDataAccessPage() {
  // Data states
  const [dataAccesses, setDataAccesses] = useState<ResponsibilityDataAccess[]>([]);
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [objects, setObjects] = useState<ObjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  // UI states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterResponsibility, setFilterResponsibility] = useState("");
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error";
  }>({ isOpen: false, title: "", message: "", type: "success" });

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccess, setEditingAccess] = useState<ResponsibilityDataAccess | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    responsibility_id: "",
    object_id: "",
    access_level: "READ",
    scope_filter: "",
    effective_date: "",
    expire_date: "",
    is_active: 1,
  });

  // Geo filter states (for scope builder in form)
  const [geoRegionId, setGeoRegionId] = useState("");
  const [geoProvinceDistrictId, setGeoProvinceDistrictId] = useState("");
  const [geoProvinceId, setGeoProvinceId] = useState("");
  const [geoDistrictId, setGeoDistrictId] = useState("");
  const [geoSubdistrictId, setGeoSubdistrictId] = useState("");

  const [regions, setRegions] = useState<GeoOption[]>([]);
  const [provinceDistricts, setProvinceDistricts] = useState<GeoOption[]>([]);
  const [provinces, setProvinces] = useState<GeoOption[]>([]);
  const [districts, setDistricts] = useState<GeoOption[]>([]);
  const [subdistricts, setSubdistricts] = useState<GeoOption[]>([]);

  // Show notification
  const showNotification = (title: string, message: string, type: "success" | "error") => {
    setNotification({ isOpen: true, title, message, type });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, isOpen: false }));
    }, 3000);
  };

  // Fetch all data
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch data accesses
      const accessRes = await fetch(`${API_BASE}/admin/responsibility-data-accesses`);
      if (accessRes.ok) {
        const data = await accessRes.json();
        setDataAccesses(data.data || []);
      }

      // Fetch responsibilities
      const respRes = await fetch(`${API_BASE}/admin/responsibilities`);
      if (respRes.ok) {
        const data = await respRes.json();
        setResponsibilities(data.data || []);
      }

      // Fetch objects
      const objRes = await fetch(`${API_BASE}/admin/options/objects`);
      if (objRes.ok) {
        const data = await objRes.json();
        setObjects(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      showNotification("เกิดข้อผิดพลาด", "ไม่สามารถโหลดข้อมูลได้", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Load regions once on mount
    fetch(`${API_BASE}/admin/ref/regions`)
      .then(r => r.json())
      .then(d => setRegions(d.data || []))
      .catch(() => {});
  }, []);

  // Cascade: region → province-districts + provinces
  useEffect(() => {
    setGeoProvinceDistrictId("");
    setGeoProvinceId("");
    setGeoDistrictId("");
    setGeoSubdistrictId("");
    setProvinceDistricts([]);
    setProvinces([]);
    setDistricts([]);
    setSubdistricts([]);
    if (!geoRegionId) return;
    const q = `?region_id=${geoRegionId}`;
    fetch(`${API_BASE}/admin/ref/province-districts${q}`)
      .then(r => r.json()).then(d => setProvinceDistricts(d.data || [])).catch(() => {});
    fetch(`${API_BASE}/admin/ref/provinces${q}`)
      .then(r => r.json()).then(d => setProvinces(d.data || [])).catch(() => {});
  }, [geoRegionId]);

  // Cascade: province-district → provinces (narrow further)
  useEffect(() => {
    setGeoProvinceId("");
    setGeoDistrictId("");
    setGeoSubdistrictId("");
    setDistricts([]);
    setSubdistricts([]);
    if (!geoProvinceDistrictId) return;
    const q = `?province_district_id=${geoProvinceDistrictId}${geoRegionId ? `&region_id=${geoRegionId}` : ""}`;
    fetch(`${API_BASE}/admin/ref/provinces${q}`)
      .then(r => r.json()).then(d => setProvinces(d.data || [])).catch(() => {});
  }, [geoProvinceDistrictId]);

  // Cascade: province → districts
  useEffect(() => {
    setGeoDistrictId("");
    setGeoSubdistrictId("");
    setDistricts([]);
    setSubdistricts([]);
    if (!geoProvinceId) return;
    fetch(`${API_BASE}/admin/ref/districts?province_id=${geoProvinceId}`)
      .then(r => r.json()).then(d => setDistricts(d.data || [])).catch(() => {});
  }, [geoProvinceId]);

  // Cascade: district → subdistricts
  useEffect(() => {
    setGeoSubdistrictId("");
    setSubdistricts([]);
    if (!geoDistrictId) return;
    fetch(`${API_BASE}/admin/ref/subdistricts?district_id=${geoDistrictId}`)
      .then(r => r.json()).then(d => setSubdistricts(d.data || [])).catch(() => {});
  }, [geoDistrictId]);

  // Auto-build scope_filter from geo selection
  useEffect(() => {
    const parts: string[] = [];
    if (geoProvinceId) parts.push(`PROVINCE_ID = '${geoProvinceId}'`);
    if (geoDistrictId) parts.push(`DISTRICT_ID = '${geoDistrictId}'`);
    if (geoSubdistrictId) parts.push(`SUBDISTRICT_ID = '${geoSubdistrictId}'`);
    if (parts.length > 0) {
      setFormData(p => ({ ...p, scope_filter: parts.join(" AND ") }));
    }
  }, [geoProvinceId, geoDistrictId, geoSubdistrictId]);

  // Reset geo selects when modal closes/opens
  const resetGeo = () => {
    setGeoRegionId("");
    setGeoProvinceDistrictId("");
    setGeoProvinceId("");
    setGeoDistrictId("");
    setGeoSubdistrictId("");
    setProvinceDistricts([]);
    setProvinces([]);
    setDistricts([]);
    setSubdistricts([]);
  };

  // Filtered data accesses
  const filteredAccesses = dataAccesses.filter((access) => {
    const matchesSearch =
      !searchQuery ||
      access.responsibility_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      access.responsibility_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      access.object_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      access.object_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      access.access_level?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesResponsibility =
      !filterResponsibility || access.responsibility_id.toString() === filterResponsibility;

    return matchesSearch && matchesResponsibility;
  });

  // Get access level badge
  const getAccessLevelBadge = (level: string) => {
    const config = ACCESS_LEVELS.find((l) => l.value === level) || ACCESS_LEVELS[0];
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
        {config.label}
      </span>
    );
  };

  // Open add modal
  const openAddModal = () => {
    setEditingAccess(null);
    resetGeo();
    setFormData({
      responsibility_id: "",
      object_id: "",
      access_level: "READ",
      scope_filter: "",
      effective_date: new Date().toISOString().split("T")[0],
      expire_date: "",
      is_active: 1,
    });
    setIsModalOpen(true);
  };

  // Open edit modal
  const openEditModal = (access: ResponsibilityDataAccess) => {
    setEditingAccess(access);
    resetGeo();
    setFormData({
      responsibility_id: access.responsibility_id.toString(),
      object_id: access.object_id.toString(),
      access_level: access.access_level || "READ",
      scope_filter: access.scope_filter || "",
      effective_date: access.effective_date || "",
      expire_date: access.expire_date || "",
      is_active: access.is_active,
    });
    setIsModalOpen(true);
  };

  // Handle save
  const handleSave = async () => {
    try {
      const url = editingAccess
        ? `${API_BASE}/admin/responsibility-data-accesses/${editingAccess.id}`
        : `${API_BASE}/admin/responsibility-data-accesses`;

      const method = editingAccess ? "PUT" : "POST";

      const payload = {
        ...formData,
        responsibility_id: parseInt(formData.responsibility_id),
        object_id: parseInt(formData.object_id),
        effective_date: formData.effective_date || null,
        expire_date: formData.expire_date || null,
        scope_filter: formData.scope_filter || null,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to save data access");

      showNotification(
        "สำเร็จ",
        editingAccess ? "อัปเดต Data Access เรียบร้อย" : "สร้าง Data Access เรียบร้อย",
        "success"
      );
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      showNotification("เกิดข้อผิดพลาด", "ไม่สามารถบันทึก Data Access ได้", "error");
    }
  };

  // Handle delete
  const handleDelete = async (id: number) => {
    const confirmed = await showConfirm("ยืนยันการลบ", "ต้องการลบ Data Access นี้ใช่หรือไม่?");
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE}/admin/responsibility-data-accesses/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete data access");

      showNotification("สำเร็จ", "ลบ Data Access เรียบร้อย", "success");
      fetchData();
    } catch (error) {
      showNotification("เกิดข้อผิดพลาด", "ไม่สามารถลบ Data Access ได้", "error");
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">จัดการ Responsibility Data Access</h1>
            <p className="text-sm text-gray-500 mt-1">
              จัดการสิทธิ์การเข้าถึงข้อมูลของ Responsibility
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            เพิ่ม Data Access
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหา Responsibility, Object, Access Level..."
            className="input-minimal w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterResponsibility}
          onChange={(e) => setFilterResponsibility(e.target.value)}
          className="px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ทุก Responsibility</option>
          {responsibilities.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="cds--data-table cds--data-table--sm w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    Responsibility
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    Object
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    Access Level
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    Scope Filter
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    วันที่มีผล
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    สถานะ
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAccesses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : (
                  filteredAccesses.map((access, index) => (
                    <tr
                      key={access.id}
                      className={index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                    >
                      <td className="px-4 py-4 border-b">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <Database className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <div className="font-medium text-sm text-gray-900">
                              {access.responsibility_name}
                            </div>
                            <div className="text-xs text-gray-500">{access.responsibility_code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 border-b">
                        <div className="font-medium text-sm text-gray-900">
                          {access.object_name}
                        </div>
                        <div className="text-xs text-gray-500">{access.object_code}</div>
                      </td>
                      <td className="px-4 py-4 border-b">
                        {getAccessLevelBadge(access.access_level)}
                      </td>
                      <td className="px-4 py-4 border-b">
                        {access.scope_filter ? (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Filter className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate max-w-[150px]" title={access.scope_filter}>
                              {access.scope_filter}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 border-b">
                        <div className="text-sm text-gray-600">
                          {access.effective_date ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              {access.effective_date}
                            </div>
                          ) : (
                            "-"
                          )}
                        </div>
                        {access.expire_date && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            ถึง {access.expire_date}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 border-b">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            access.is_active === 1
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {access.is_active === 1 ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4 border-b text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(access)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            title="แก้ไข"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(access.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                            title="ลบ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingAccess ? "แก้ไข Data Access" : "เพิ่ม Data Access"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Responsibility <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.responsibility_id}
                  onChange={(e) => setFormData((p) => ({ ...p, responsibility_id: e.target.value }))}
                  disabled={!!editingAccess}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-100"
                >
                  <option value="">เลือก Responsibility...</option>
                  {responsibilities.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Object <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.object_id}
                  onChange={(e) => setFormData((p) => ({ ...p, object_id: e.target.value }))}
                  disabled={!!editingAccess}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-100"
                >
                  <option value="">เลือก Object...</option>
                  {objects.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Level
                </label>
                <select
                  value={formData.access_level}
                  onChange={(e) => setFormData((p) => ({ ...p, access_level: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  {ACCESS_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Geographic scope builder */}
              <div className="border border-[#EEEEEE] rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-[#939393] uppercase tracking-wide">ขอบเขตพื้นที่ (สร้าง Scope Filter อัตโนมัติ)</p>
                <div className="grid grid-cols-2 gap-2">
                  {/* ภาค */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ภาค</label>
                    <select
                      value={geoRegionId}
                      onChange={e => setGeoRegionId(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    >
                      <option value="">ทุกภาค</option>
                      {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  {/* เขตพื้นที่ */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">เขตพื้นที่</label>
                    <select
                      value={geoProvinceDistrictId}
                      onChange={e => setGeoProvinceDistrictId(e.target.value)}
                      disabled={!geoRegionId && provinceDistricts.length === 0}
                      className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="">ทุกเขตพื้นที่</option>
                      {provinceDistricts.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  {/* จังหวัด */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">จังหวัด</label>
                    <select
                      value={geoProvinceId}
                      onChange={e => setGeoProvinceId(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    >
                      <option value="">ทุกจังหวัด</option>
                      {provinces.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  {/* อำเภอ */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">อำเภอ</label>
                    <select
                      value={geoDistrictId}
                      onChange={e => setGeoDistrictId(e.target.value)}
                      disabled={!geoProvinceId}
                      className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="">ทุกอำเภอ</option>
                      {districts.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  {/* ตำบล - full width */}
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">ตำบล</label>
                    <select
                      value={geoSubdistrictId}
                      onChange={e => setGeoSubdistrictId(e.target.value)}
                      disabled={!geoDistrictId}
                      className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="">ทุกตำบล</option>
                      {subdistricts.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Scope Filter
                </label>
                <input
                  type="text"
                  value={formData.scope_filter}
                  onChange={(e) => setFormData((p) => ({ ...p, scope_filter: e.target.value }))}
                  className="input-minimal w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="เช่น PROVINCE_ID = 'xxx' AND DISTRICT_ID = 'yyy'"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่เริ่มต้น
                  </label>
                  <ThaiDatePicker
                    value={formData.effective_date}
                    onChange={(iso) => setFormData((p) => ({ ...p, effective_date: iso }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่สิ้นสุด
                  </label>
                  <ThaiDatePicker
                    value={formData.expire_date}
                    onChange={(iso) => setFormData((p) => ({ ...p, expire_date: iso }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.is_active}
                  onChange={(e) => setFormData((p) => ({ ...p, is_active: parseInt(e.target.value) }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value={1}>ใช้งาน</option>
                  <option value={0}>ไม่ใช้งาน</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.responsibility_id || !formData.object_id}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                <Save className="w-4 h-4 inline mr-1" />
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {notification.isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setNotification((p) => ({ ...p, isOpen: false }))}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                notification.type === "error" ? "bg-red-100" : "bg-emerald-100"
              }`}
            >
              {notification.type === "error" ? (
                <X className="h-7 w-7 text-red-600" />
              ) : (
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              )}
            </div>
            <h3 className="mb-2 text-lg font-bold text-gray-900">{notification.title}</h3>
            <p className="mb-6 text-sm text-gray-500">{notification.message}</p>
            <button
              onClick={() => setNotification((p) => ({ ...p, isOpen: false }))}
              className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${
                notification.type === "error"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
