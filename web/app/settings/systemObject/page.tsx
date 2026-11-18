"use client";

import { useState, useEffect } from "react";
import { showSuccess, showError } from "@/lib/swal";
import {
  Search,
  Database,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Plus,
  X,
  Pencil,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";

interface Option {
  value: string;
  label: string;
}

interface ObjectItem {
  objectId?: number | null;
  objectName?: string | null;
  path?: string | null;
  parentObjectId?: number | null;
  objectTypeName?: string | null;
  children?: ObjectItem[];
}

interface SystemWithObjects {
  systemId?: number | null;
  systemName?: string | null;
  systemAbv?: string | null;
  systemDesc?: string | null;
  objects: ObjectItem[];
}

export default function SystemObjectPage() {
  const [data, setData] = useState<SystemWithObjects[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchSystem, setSearchSystem] = useState("");
  const [searchObject, setSearchObject] = useState("");
  const [selectedSystemId, setSelectedSystemId] = useState<number | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  // Options for dropdown
  const [objectTypeOptions, setObjectTypeOptions] = useState<Option[]>([]);
  const [parentObjectOptions, setParentObjectOptions] = useState<Option[]>([]);
  const [menuParentObjectOptions, setMenuParentObjectOptions] = useState<Option[]>([]);

  // Modal states
  const [showSystemModal, setShowSystemModal] = useState(false);
  const [showObjectModal, setShowObjectModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingSystemId, setEditingSystemId] = useState<number | null>(null);
  const [editingObjectId, setEditingObjectId] = useState<number | null>(null);

  // System form
  const [systemName, setSystemName] = useState("");
  const [systemABV, setSystemABV] = useState("");
  const [systemDesc, setSystemDesc] = useState("");

  // Object form
  const [objectName, setObjectName] = useState("");
  const [objectPath, setObjectPath] = useState("");
  const [objectTypeId, setObjectTypeId] = useState("");
  const [parentObjectId, setParentObjectId] = useState("");

  // โหลด object type options
  const fetchObjectTypeOptions = async () => {
    try {
      const res = await fetch(`${API_BASE}/iamx/api/admin/options/object-types`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch object types");
      const result = await res.json();
      const data = (result.data || result || []) as Option[];
      setObjectTypeOptions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching object types:", err);
    }
  };

  // โหลด parent object options สำหรับ SUB_MENU
  const fetchParentObjectOptions = async (systemId: number) => {
    try {
      const res = await fetch(
        `${API_BASE}/iamx/api/admin/options/parent-objects?systemId=${systemId}`,
        {
          cache: "no-store",
        }
      );
      if (!res.ok) throw new Error("Failed to fetch parent objects");
      const result = await res.json();
      const data = (result.data || result || []) as Option[];
      setParentObjectOptions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching parent objects:", err);
      setParentObjectOptions([]);
    }
  };

  // โหลด parent object options สำหรับ MENU
  const fetchMenuParentObjectOptions = async (systemId: number) => {
    try {
      const res = await fetch(
        `${API_BASE}/iamx/api/admin/options/menu-parent-objects?systemId=${systemId}`,
        {
          cache: "no-store",
        }
      );
      if (!res.ok) throw new Error("Failed to fetch menu parent objects");
      const result = await res.json();
      const data = (result.data || result || []) as Option[];
      setMenuParentObjectOptions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching menu parent objects:", err);
      setMenuParentObjectOptions([]);
    }
  };

  // โหลดข้อมูลจาก API
  useEffect(() => {
    loadData();
    fetchObjectTypeOptions();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const url = `${API_BASE}/iamx/api/system-objects`;
      console.log("📡 Fetching system-objects from:", url);

      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (res.ok) {
        const result = await res.json();
        console.log("✅ System-objects loaded:", result);

        if (result.success && result.data) {
          setData(result.data);
        } else {
          setData([]);
        }
      } else {
        const errorText = await res.text();
        console.error("❌ Failed to load:", errorText);
        setError(`Failed to load data: ${res.status}`);
        setData([]);
      }
    } catch (e) {
      console.error("💥 Exception loading data:", e);
      setError(`Error: ${e}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // เปิด modal สำหรับแก้ไข System
  const handleEditSystem = (sys: SystemWithObjects) => {
    setEditMode(true);
    setEditingSystemId(sys.systemId || null);
    setSystemName(sys.systemName || "");
    setSystemABV(sys.systemAbv || "");
    setSystemDesc(sys.systemDesc || "");
    setShowSystemModal(true);
  };

  // สร้าง/แก้ไข System
  const handleSaveSystem = async () => {
    if (!systemName.trim()) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณากรอกชื่อระบบ");
      return;
    }

    setSaving(true);
    try {
      const url = editMode
        ? `${API_BASE}/iamx/api/systems/${editingSystemId}`
        : `${API_BASE}/iamx/api/system-objects`;

      const method = editMode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_name: systemName,
          system_abv: systemABV || null,
          system_desc: systemDesc || null,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        console.log(
          editMode ? "✅ System updated:" : "✅ System created:",
          result,
        );
        showSuccess(editMode ? "แก้ไขสำเร็จ" : "สร้างสำเร็จ", editMode ? "แก้ไขระบบสำเร็จ" : "สร้างระบบสำเร็จ");
        setShowSystemModal(false);
        setEditMode(false);
        setEditingSystemId(null);
        setSystemName("");
        setSystemABV("");
        setSystemDesc("");
        await loadData(); // โหลดข้อมูลใหม่
      } else {
        const errorText = await res.text();
        console.error("❌ Failed:", errorText);
        showError("เกิดข้อผิดพลาด", editMode ? "แก้ไขระบบไม่สำเร็จ" : "สร้างระบบไม่สำเร็จ");
      }
    } catch (e) {
      console.error("💥 Exception:", e);
      showError("เกิดข้อผิดพลาด", String(e));
    } finally {
      setSaving(false);
    }
  };

  // เปิด modal สำหรับแก้ไข Object
  const handleEditObject = async (obj: ObjectItem) => {
    setEditingObjectId(obj.objectId || null);
    setObjectName(obj.objectName || "");
    setObjectPath(obj.path || "");
    setParentObjectId(obj.parentObjectId ? String(obj.parentObjectId) : "");

    // หา objectTypeId จาก objectTypeName
    const found = objectTypeOptions.find(
      (x) => (x.label || "").trim() === (obj.objectTypeName || "").trim()
    );
    setObjectTypeId(found?.value || "");

    // โหลด parent object options สำหรับ system ที่เลือก
    if (selectedSystemId) {
      await fetchParentObjectOptions(selectedSystemId);
      await fetchMenuParentObjectOptions(selectedSystemId);
    }

    setShowObjectModal(true);
  };

  // สร้าง/แก้ไข Object
  const handleCreateObject = async () => {
    if (!selectedSystemId && !editingObjectId) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือก System ก่อน");
      return;
    }

    if (!objectName.trim()) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณากรอกชื่อเมนู");
      return;
    }

    if (!objectTypeId) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือกประเภท");
      return;
    }

    // เช็คว่าเป็น SUB_MENU (-97) หรือ MENU (-98)
    const isSubMenu = objectTypeId === "-97";
    const isMenu = objectTypeId === "-98";

    if (isSubMenu && !parentObjectId) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือก Parent Object สำหรับ SUB_MENU");
      return;
    }

    if (isMenu && !parentObjectId) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือก Parent Object สำหรับ MENU");
      return;
    }

    setSaving(true);
    try {
      const isEditing = editingObjectId !== null;
      const url = isEditing
        ? `${API_BASE}/iamx/api/objects/${editingObjectId}`
        : `${API_BASE}/iamx/api/system-objects/${selectedSystemId}/objects`;
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object_name: objectName,
          path: objectPath || null,
          object_type_id: objectTypeId ? parseInt(objectTypeId) : null,
          parent_object_id: parentObjectId ? parseInt(parentObjectId) : null,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        console.log(
          isEditing ? "✅ Object updated:" : "✅ Object created:",
          result
        );
        showSuccess(isEditing ? "แก้ไขสำเร็จ" : "สร้างสำเร็จ", isEditing ? "แก้ไขเมนูสำเร็จ" : "สร้างเมนูสำเร็จ");
        setShowObjectModal(false);
        setObjectName("");
        setObjectPath("");
        setObjectTypeId("");
        setParentObjectId("");
        setEditingObjectId(null);
        await loadData(); // โหลดข้อมูลใหม่
      } else {
        const errorText = await res.text();
        console.error("❌ Failed:", errorText);
        showError("เกิดข้อผิดพลาด", `${isEditing ? "แก้ไข" : "สร้าง"}เมนูไม่สำเร็จ`);
      }
    } catch (e) {
      console.error("💥 Exception:", e);
      showError("เกิดข้อผิดพลาด", String(e));
    } finally {
      setSaving(false);
    }
  };

  // กรอง SYSTEM ตาม search
  const filteredSystems = data.filter((sys) => {
    if (!searchSystem.trim()) return true;
    const query = searchSystem.toLowerCase();
    const name = (sys.systemName || "").toLowerCase();
    const id = String(sys.systemId || "");
    return name.includes(query) || id.includes(query);
  });

  // หา SYSTEM ที่เลือก
  const selectedSystem = data.find((sys) => sys.systemId === selectedSystemId);

  // สร้าง tree structure จาก flat list
  const buildTree = (objects: ObjectItem[]): ObjectItem[] => {
    const map = new Map<number, ObjectItem>();
    const roots: ObjectItem[] = [];

    // สร้าง map และเตรียม children array
    objects.forEach((obj) => {
      if (obj.objectId) {
        map.set(obj.objectId, { ...obj, children: [] });
      }
    });

    // สร้างความสัมพันธ์ parent-child
    objects.forEach((obj) => {
      if (obj.objectId) {
        const node = map.get(obj.objectId);
        if (node) {
          if (obj.parentObjectId && map.has(obj.parentObjectId)) {
            // มี parent - เพิ่มเป็น child ของ parent
            const parent = map.get(obj.parentObjectId);
            if (parent && parent.children) {
              parent.children.push(node);
            }
          } else {
            // ไม่มี parent - เป็น root node
            roots.push(node);
          }
        }
      }
    });

    return roots;
  };

  // กรอง OBJECT ตาม search
  const filteredObjects = selectedSystem
    ? selectedSystem.objects.filter((obj) => {
        if (!searchObject.trim()) return true;
        const query = searchObject.toLowerCase();
        const name = (obj.objectName || "").toLowerCase();
        const path = (obj.path || "").toLowerCase();
        const typeName = (obj.objectTypeName || "").toLowerCase();
        return (
          name.includes(query) ||
          path.includes(query) ||
          typeName.includes(query)
        );
      })
    : [];

  // สร้าง tree จาก filtered objects
  const objectTree = buildTree(filteredObjects);

  // Toggle expand/collapse
  const toggleNode = (objectId: number) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(objectId)) {
        newSet.delete(objectId);
      } else {
        newSet.add(objectId);
      }
      return newSet;
    });
  };

  // Recursive component สำหรับแสดง tree node
  const ObjectTreeNode = ({ obj, level = 0 }: { obj: ObjectItem; level?: number }) => {
    const hasChildren = obj.children && obj.children.length > 0;
    const isExpanded = obj.objectId ? expandedNodes.has(obj.objectId) : false;

    return (
      <div>
        <div
          className="mb-2 p-3 rounded-lg border border-gray-200 bg-white hover:border-gray-400 hover:shadow-md transition-all"
          style={{ marginLeft: `${level * 24}px` }}
        >
          <div className="flex items-start gap-2">
            {/* Toggle button */}
            <div className="flex-shrink-0 mt-0.5">
              {hasChildren ? (
                <button
                  onClick={() => obj.objectId && toggleNode(obj.objectId)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-gray-600" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-600" />
                  )}
                </button>
              ) : (
                <div className="w-6 h-6" />
              )}
            </div>

            {/* Icon */}
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
              <FolderTree size={16} className="text-gray-600" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                {obj.objectName || "-"}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditObject(obj);
                  }}
                  className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                  title="แก้ไข"
                >
                  <Pencil size={14} className="text-gray-600" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {obj.objectId && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">
                    ID: {obj.objectId}
                  </span>
                )}
                {obj.objectTypeName && (
                  <span className="px-2 py-1 bg-gray-800 text-white rounded font-medium">
                    {obj.objectTypeName}
                  </span>
                )}
                {hasChildren && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded font-medium">
                    {obj.children?.length} รายการย่อย
                  </span>
                )}
              </div>
              {obj.path && (
                <div className="mt-2 text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded border border-gray-200">
                  {obj.path}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {obj.children?.map((child) => (
              <ObjectTreeNode
                key={child.objectId}
                obj={child}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        <div className="flex-1 overflow-auto">
          {/* Header */}
          <div className="bg-gray-900 text-white px-6 py-5 border-b-2 border-gray-800">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <Database size={28} />
              ระบบและเมนู (System & Object)
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              จัดการข้อมูล SYSTEM และ OBJECT ในระบบ
            </p>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-6">
              {/* LEFT PANEL - SYSTEM List (50%) */}
              <div className="w-1/2 bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      size={18}
                    />
                    <input
                      type="text"
                      placeholder="ค้นหาระบบ..."
                      value={searchSystem}
                      onChange={(e) => setSearchSystem(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm"
                    />
                  </div>
                </div>

                <div className="bg-gray-800 text-white px-4 py-3 flex items-center gap-2 border-b border-gray-700">
                  <Database size={18} />
                  <span className="font-medium">ระบบ (SYSTEM)</span>
                  <span className="ml-2 px-2 py-0.5 bg-gray-700 text-gray-100 rounded text-xs font-bold">
                    {filteredSystems.length} รายการ
                  </span>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setEditingSystemId(null);
                      setSystemName("");
                      setSystemABV("");
                      setSystemDesc("");
                      setShowSystemModal(true);
                    }}
                    className="ml-auto px-3 py-1.5 bg-white text-gray-800 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-1 text-sm font-medium"
                  >
                    <Plus size={16} />
                    เพิ่มระบบ
                  </button>
                </div>

                <div className="p-4 max-h-[calc(100vh-300px)] overflow-auto">
                  {loading && (
                    <div className="flex items-center justify-center py-20 text-gray-500">
                      <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>
                      กำลังโหลดข้อมูล...
                    </div>
                  )}

                  {!loading && filteredSystems.length === 0 && (
                    <div className="text-center text-gray-500 py-20">
                      {searchSystem
                        ? "ไม่พบข้อมูลที่ค้นหา"
                        : "ไม่มีข้อมูล System"}
                    </div>
                  )}

                  {!loading &&
                    filteredSystems.map((sys) => (
                      <div
                        key={sys.systemId}
                        className={`mb-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                          selectedSystemId === sys.systemId
                            ? "border-gray-800 bg-gray-50 shadow-md"
                            : "border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm"
                        }`}
                        onClick={() => {
                          setSelectedSystemId(sys.systemId || null);
                          setSearchObject(""); // รีเซ็ตการค้นหา object
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              selectedSystemId === sys.systemId
                                ? "bg-gray-800"
                                : "bg-gray-200"
                            }`}
                          >
                            <Database
                              size={20}
                              className={
                                selectedSystemId === sys.systemId
                                  ? "text-white"
                                  : "text-gray-600"
                              }
                            />
                          </div>
                          <div className="flex-1">
                            <div
                              className={`font-semibold flex items-center gap-2 ${
                                selectedSystemId === sys.systemId
                                  ? "text-gray-900"
                                  : "text-gray-800"
                              }`}
                            >
                              {sys.systemName || "-"}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditSystem(sys);
                                }}
                                className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                                title="แก้ไขระบบ"
                              >
                                <Pencil size={14} className="text-gray-600" />
                              </button>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              System ID: {sys.systemId}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {sys.objects.length} objects
                            </div>
                          </div>
                          <ChevronRight
                            size={20}
                            className={
                              selectedSystemId === sys.systemId
                                ? "text-gray-800"
                                : "text-gray-400"
                            }
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* RIGHT PANEL - OBJECT List (50%) */}
              <div className="w-1/2 bg-white rounded-lg shadow">
                {!selectedSystemId ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <FolderTree size={64} className="text-gray-300 mb-4" />
                    <p className="text-lg">กรุณาเลือก System</p>
                    <p className="text-sm text-gray-400 mt-1">
                      เพื่อดูรายการ Objects
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="p-4 border-b">
                      <div className="relative">
                        <Search
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                          size={18}
                        />
                        <input
                          type="text"
                          placeholder="ค้นหาออบเจ็กต์..."
                          value={searchObject}
                          onChange={(e) => setSearchObject(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm"
                        />
                      </div>
                    </div>

                    <div className="bg-gray-800 text-white px-4 py-3 flex items-center gap-2 border-b border-gray-700">
                      <FolderTree size={18} />
                      <span className="font-medium">เมนู (OBJECT)</span>
                      <span className="ml-2 px-2 py-0.5 bg-gray-700 text-gray-100 rounded text-xs font-bold">
                        {selectedSystem?.objects.length || 0} รายการ
                      </span>
                      <button
                        onClick={async () => {
                          setEditingObjectId(null);
                          setObjectName("");
                          setObjectPath("");
                          setObjectTypeId("");
                          setParentObjectId("");
                          // โหลด parent object options
                          if (selectedSystemId) {
                            await fetchParentObjectOptions(selectedSystemId);
                            await fetchMenuParentObjectOptions(selectedSystemId);
                          }
                          setShowObjectModal(true);
                        }}
                        className="ml-auto px-3 py-1.5 bg-white text-gray-800 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-1 text-sm font-medium"
                      >
                        <Plus size={16} />
                        เพิ่มเมนู
                      </button>
                    </div>

                    <div className="px-4 py-3 border-b bg-gray-50">
                      <div className="text-sm">
                        <span className="text-gray-600">System: </span>
                        <span className="font-semibold text-gray-900">
                          {selectedSystem?.systemName || "-"}
                        </span>
                        <span className="text-gray-400 ml-2">
                          (ID: {selectedSystem?.systemId})
                        </span>
                      </div>
                    </div>

                    <div className="p-4 max-h-[calc(100vh-360px)] overflow-auto">
                      {objectTree.length === 0 && (
                        <div className="text-center text-gray-500 py-20">
                          {searchObject
                            ? "ไม่พบข้อมูลที่ค้นหา"
                            : "ไม่มี Objects ในระบบนี้"}
                        </div>
                      )}

                      {objectTree.map((obj) => (
                        <ObjectTreeNode key={obj.objectId} obj={obj} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal สำหรับเพิ่มระบบ */}
      {showSystemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="bg-gray-800 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {editMode ? <Pencil size={20} /> : <Database size={20} />}
                {editMode ? "แก้ไขระบบ" : "เพิ่มระบบใหม่"}
              </h3>
              <button
                onClick={() => {
                  setShowSystemModal(false);
                  setEditMode(false);
                  setEditingSystemId(null);
                }}
                className="text-white hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อระบบ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={systemName}
                  onChange={(e) => setSystemName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="ระบุชื่อระบบ"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อย่อระบบ
                </label>
                <input
                  type="text"
                  value={systemABV}
                  onChange={(e) => setSystemABV(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="ระบุชื่อย่อ"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  คำอธิบาย
                </label>
                <textarea
                  value={systemDesc}
                  onChange={(e) => setSystemDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="ระบุคำอธิบาย"
                  rows={3}
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSystemModal(false);
                  setEditMode(false);
                  setEditingSystemId(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
                disabled={saving}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveSystem}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 flex items-center gap-2"
                disabled={saving}
              >
                {saving && <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal สำหรับเพิ่มเมนู */}
      {showObjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="bg-gray-800 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {editingObjectId ? (
                  <>
                    <Pencil size={20} />
                    แก้ไขเมนู
                  </>
                ) : (
                  <>
                    <FolderTree size={20} />
                    เพิ่มเมนูใหม่
                  </>
                )}
              </h3>
              <button
                onClick={() => {
                  setShowObjectModal(false);
                  setEditingObjectId(null);
                }}
                className="text-white hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-sm text-gray-600">ระบบที่เลือก:</div>
                <div className="font-semibold text-gray-900">
                  {selectedSystem?.systemName || "-"}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อเมนู <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={objectName}
                  onChange={(e) => setObjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="ระบุชื่อเมนู"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ประเภท <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
                  value={objectTypeId}
                  onChange={(e) => {
                    setObjectTypeId(e.target.value);
                    // รีเซ็ต parent object เมื่อเปลี่ยนประเภท
                    setParentObjectId("");
                  }}
                >
                  <option value="">-- เลือกประเภท --</option>
                  {objectTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* แสดง select สำหรับเลือก parent object เมื่อประเภทเป็น MENU (-98) หรือ SUB_MENU (-97) */}
              {(() => {
                // เช็คตาม OBJECT_TYPE_ID
                const isMenu = objectTypeId === "-98"; // MENU
                const isSubMenu = objectTypeId === "-97"; // SUB_MENU

                if (isMenu) {
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Parent Object <span className="text-red-500">*</span>
                      </label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
                        value={parentObjectId}
                        onChange={(e) => setParentObjectId(e.target.value)}
                      >
                        <option value="">-- เลือก Parent Object --</option>
                        {menuParentObjectOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                } else if (isSubMenu) {
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Parent Object <span className="text-red-500">*</span>
                      </label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
                        value={parentObjectId}
                        onChange={(e) => setParentObjectId(e.target.value)}
                      >
                        <option value="">-- เลือก Parent Object --</option>
                        {parentObjectOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }
                return null;
              })()}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Path
                </label>
                <input
                  type="text"
                  value={objectPath}
                  onChange={(e) => setObjectPath(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="เช่น /menu/submenu"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowObjectModal(false);
                  setEditingObjectId(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
                disabled={saving}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCreateObject}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 flex items-center gap-2"
                disabled={saving}
              >
                {saving && <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>}
                {editingObjectId ? "บันทึกการแก้ไข" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
