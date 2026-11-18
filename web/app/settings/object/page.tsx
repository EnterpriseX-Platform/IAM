"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { showSuccess, showError, showConfirm } from "@/lib/swal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

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

interface ObjectDisplay {
  id: number;
  name: string;
  path?: string | null;
  typeName?: string | null;
  parentObjectId?: number | null;
  hasChildren: boolean;
  icon: string;
  color: string;
}

const iconColors = [
  { icon: "📋", color: "bg-blue-50 text-blue-600" },
  { icon: "🔧", color: "bg-emerald-50 text-emerald-600" },
  { icon: "⚙️", color: "bg-amber-50 text-amber-700" },
  { icon: "🎯", color: "bg-violet-50 text-violet-700" },
  { icon: "📊", color: "bg-cyan-50 text-cyan-700" },
  { icon: "🔐", color: "bg-indigo-50 text-indigo-700" },
  { icon: "📁", color: "bg-slate-50 text-slate-700" },
  { icon: "🎨", color: "bg-pink-50 text-pink-700" },
  { icon: "💼", color: "bg-gray-50 text-gray-700" },
  { icon: "🌟", color: "bg-orange-50 text-orange-700" },
];

function clsx(...arr: Array<string | boolean | undefined | null>) {
  return arr.filter(Boolean).join(" ");
}

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-gray-200 bg-white shadow-[0_1px_0_rgba(15,23,42,.02)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function IconTile({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "grid h-12 w-12 place-items-center rounded-2xl border border-gray-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default function ObjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get module context from URL
  const urlModuleId = searchParams.get("moduleId");
  const urlModuleName = searchParams.get("moduleName");
  const urlAppName = searchParams.get("appName");

  const [objects, setObjects] = useState<ObjectDisplay[]>([]);
  const [objectTree, setObjectTree] = useState<ObjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  // list controls
  const [search, setSearch] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  // Modal states
  const [showObjectModal, setShowObjectModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingObjectId, setEditingObjectId] = useState<number | null>(null);

  // Options for dropdown
  const [objectTypeOptions, setObjectTypeOptions] = useState<Option[]>([]);
  const [parentObjectOptions, setParentObjectOptions] = useState<Option[]>([]);
  const [menuParentObjectOptions, setMenuParentObjectOptions] = useState<Option[]>([]);

  // Object form
  const [objectName, setObjectName] = useState("");
  const [objectPath, setObjectPath] = useState("");
  const [objectTypeId, setObjectTypeId] = useState("");
  const [parentObjectId, setParentObjectId] = useState("");
  const [parentObjectName, setParentObjectName] = useState("");
  const [parentObjectType, setParentObjectType] = useState<string | null>(null);

  // Build tree structure from flat list
  const buildTreeFromFlatList = (items: ObjectItem[]): ObjectItem[] => {
    const map = new Map<number, ObjectItem>();
    const roots: ObjectItem[] = [];

    // Create map and initialize children array
    items.forEach((item) => {
      if (item.objectId) {
        map.set(item.objectId, { ...item, children: [] });
      }
    });

    // Build parent-child relationships
    items.forEach((item) => {
      if (item.objectId) {
        const node = map.get(item.objectId);
        if (node) {
          if (item.parentObjectId && map.has(item.parentObjectId)) {
            // Has parent - add as child
            const parent = map.get(item.parentObjectId);
            if (parent && parent.children) {
              parent.children.push(node);
            }
          } else {
            // No parent - is root node
            roots.push(node);
          }
        }
      }
    });

    return roots;
  };

  // Fetch objects from API
  const fetchObjects = async () => {
    if (!urlModuleId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/iamx/api/system-objects`
      );
      const data = await response.json();

      if (data.success && data.data) {
        // Find the system that matches moduleId
        const system = data.data.find(
          (sys: any) => sys.systemId === parseInt(urlModuleId)
        );

        if (system && system.objects) {
          // Build tree structure from flat list
          const treeStructure = buildTreeFromFlatList(system.objects);
          setObjectTree(treeStructure);

          console.log("🌲 Tree structure built:", treeStructure);

          // Flatten all objects including children for stats
          const flattenObjects = (items: ObjectItem[]): ObjectItem[] => {
            let result: ObjectItem[] = [];
            for (const item of items) {
              result.push(item);
              if (item.children && item.children.length > 0) {
                result = result.concat(flattenObjects(item.children));
              }
            }
            return result;
          };

          const allObjects = flattenObjects(system.objects);

          // Convert to flat list for display
          const displayObjects: ObjectDisplay[] = allObjects.map(
            (obj: ObjectItem, index: number) => {
              const iconColor = iconColors[index % iconColors.length];
              const hasChildren = !!(obj.children && obj.children.length > 0);
              return {
                id: obj.objectId || 0,
                name: obj.objectName || "Unnamed Object",
                path: obj.path,
                typeName: obj.objectTypeName,
                parentObjectId: obj.parentObjectId,
                hasChildren,
                icon: iconColor.icon,
                color: iconColor.color,
              };
            }
          );
          setObjects(displayObjects);
        }
      }
    } catch (error) {
      console.error("Failed to fetch objects:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch object type options
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

  // Fetch parent object options for SUB_MENU
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

  // Fetch parent object options for MENU
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

  // Open edit modal
  const handleEditObject = async (obj: ObjectDisplay) => {
    setEditingObjectId(obj.id);
    setObjectName(obj.name);
    setObjectPath(obj.path || "");
    setParentObjectId(obj.parentObjectId ? String(obj.parentObjectId) : "");
    setParentObjectName("");
    setParentObjectType(null);

    // Find objectTypeId from objectTypeName
    const found = objectTypeOptions.find(
      (x) => (x.label || "").trim() === (obj.typeName || "").trim()
    );
    setObjectTypeId(found?.value || "");

    // Load parent object options
    if (urlModuleId) {
      await fetchParentObjectOptions(parseInt(urlModuleId));
      await fetchMenuParentObjectOptions(parseInt(urlModuleId));
    }

    setShowObjectModal(true);
  };

  // Open modal to add child menu
  const handleAddChildMenu = async (parentObj: ObjectItem) => {
    setEditingObjectId(null);
    setObjectName("");
    setObjectPath("");
    setObjectTypeId("");

    const parentId = parentObj.objectId ? String(parentObj.objectId) : "";
    setParentObjectId(parentId);
    setParentObjectName(parentObj.objectName || "");
    setParentObjectType(parentObj.objectTypeName || null);

    console.log("🔍 handleAddChildMenu - Parent Object:", {
      parentObjectId: parentId,
      parentObjectName: parentObj.objectName,
      parentObjectType: parentObj.objectTypeName,
      rawObjectId: parentObj.objectId
    });

    // Load parent object options
    if (urlModuleId) {
      await fetchParentObjectOptions(parseInt(urlModuleId));
      await fetchMenuParentObjectOptions(parseInt(urlModuleId));
    }

    setShowObjectModal(true);
  };

  // Delete object (and all children)
  const handleDeleteObject = async (obj: ObjectItem) => {
    // Count children recursively
    const countChildren = (item: ObjectItem): number => {
      let count = 0;
      if (item.children && item.children.length > 0) {
        count = item.children.length;
        item.children.forEach(child => {
          count += countChildren(child);
        });
      }
      return count;
    };

    const childCount = countChildren(obj);
    const hasChildren = childCount > 0;

    const message = hasChildren
      ? `คุณต้องการลบเมนู "${obj.objectName}" และเมนูย่อยทั้งหมด (${childCount} รายการ) หรือไม่?\n\n⚠️ การลบจะลบข้อมูลทั้งหมดภายใต้เมนูนี้`
      : `คุณต้องการลบเมนู "${obj.objectName}" หรือไม่?`;

    const confirmed = await showConfirm("ยืนยันการลบ", message);
    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_BASE}/iamx/api/objects/${obj.objectId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        showSuccess("ลบสำเร็จ", hasChildren ? "ลบเมนูและเมนูย่อยทั้งหมดสำเร็จ" : "ลบเมนูสำเร็จ");
        await fetchObjects(); // Refresh list
      } else {
        const errorText = await response.text();
        console.error("❌ Failed to delete:", errorText);
        showError("เกิดข้อผิดพลาด", "ลบเมนูไม่สำเร็จ");
      }
    } catch (error) {
      console.error("💥 Exception:", error);
      showError("เกิดข้อผิดพลาด", String(error));
    }
  };

  // Create/Edit Object
  const handleSaveObject = async () => {
    if (!urlModuleId && !editingObjectId) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือก Module ก่อน");
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

    // Check if SUB_MENU (-97) or MENU (-98)
    const isSubMenu = objectTypeId === "-97";
    const isMenu = objectTypeId === "-98";

    // Only check for parent if not already set (from add child button)
    if (isSubMenu && !parentObjectId && !parentObjectName) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือก Parent Object สำหรับ SUB_MENU");
      return;
    }

    if (isMenu && !parentObjectId && !parentObjectName) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือก Parent Object สำหรับ MENU");
      return;
    }

    setSaving(true);
    try {
      const isEditing = editingObjectId !== null;
      const url = isEditing
        ? `${API_BASE}/iamx/api/objects/${editingObjectId}`
        : `${API_BASE}/iamx/api/system-objects/${urlModuleId}/objects`;
      const method = isEditing ? "PUT" : "POST";

      const finalParentObjectId = parentObjectId ? parseInt(parentObjectId) : null;

      const payload = {
        object_name: objectName,
        path: objectPath || null,
        object_type_id: objectTypeId ? parseInt(objectTypeId) : null,
        parent_object_id: finalParentObjectId,
      };

      console.log("📤 Sending to API:", {
        url,
        method,
        payload,
        rawParentObjectId: parentObjectId,
        parentObjectName,
      });

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showSuccess(isEditing ? "แก้ไขสำเร็จ" : "สร้างสำเร็จ", isEditing ? "แก้ไขเมนูสำเร็จ" : "สร้างเมนูสำเร็จ");
        setShowObjectModal(false);
        setObjectName("");
        setObjectPath("");
        setObjectTypeId("");
        setParentObjectId("");
        setParentObjectName("");
        setParentObjectType(null);
        setEditingObjectId(null);
        await fetchObjects(); // Refresh list
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

  // Fetch objects on mount
  useEffect(() => {
    fetchObjects();
    fetchObjectTypeOptions();
  }, [urlModuleId]);

  // Auto expand all nodes when data is loaded
  useEffect(() => {
    if (!loading && objectTree.length > 0 && expandedNodes.size === 0) {
      // Auto expand first level only
      const firstLevelIds = new Set<number>();
      objectTree.forEach((item) => {
        if (item.objectId && item.children && item.children.length > 0) {
          firstLevelIds.add(item.objectId);
        }
      });
      setExpandedNodes(firstLevelIds);
    }
  }, [loading, objectTree]);

  // ESC close modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowObjectModal(false);
        setParentObjectName("");
        setParentObjectType(null);
        setEditingObjectId(null);
      }
    };
    if (showObjectModal) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showObjectModal]);

  const counts = useMemo(() => {
    const total = objects.length;
    const menus = objects.filter((o) => o.typeName === "MENU").length;
    const subMenus = objects.filter((o) => o.typeName === "SUB_MENU").length;
    return { total, menus, subMenus };
  }, [objects]);

  // Filter objects tree based on search
  const filteredObjectTree = useMemo(() => {
    if (!search.trim()) return objectTree;

    const query = search.toLowerCase();

    const filterTree = (items: ObjectItem[]): ObjectItem[] => {
      const results: ObjectItem[] = [];

      for (const item of items) {
        const matches =
          (item.objectName || "").toLowerCase().includes(query) ||
          (item.path || "").toLowerCase().includes(query) ||
          (item.objectTypeName || "").toLowerCase().includes(query);

        const filteredChildren = item.children
          ? filterTree(item.children)
          : [];

        if (matches || filteredChildren.length > 0) {
          results.push({
            ...item,
            children: filteredChildren,
          });
        }
      }

      return results;
    };

    return filterTree(objectTree);
  }, [objectTree, search]);

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

  // Filter object type options based on parent type
  const getFilteredObjectTypes = (): Option[] => {
    if (!parentObjectType) {
      return objectTypeOptions;
    }

    // Define what types to exclude based on parent type
    const excludeTypes: string[] = [];

    if (parentObjectType === "MAIN_MENU") {
      excludeTypes.push("MAIN_MENU");
    } else if (parentObjectType === "MENU") {
      excludeTypes.push("MAIN_MENU", "MENU");
    } else if (parentObjectType === "SUB_MENU") {
      excludeTypes.push("MAIN_MENU", "MENU", "SUB_MENU");
    } else if (parentObjectType === "SCREEN") {
      excludeTypes.push("MAIN_MENU", "MENU", "SUB_MENU", "SCREEN");
    }

    return objectTypeOptions.filter(
      (opt) => !excludeTypes.includes(opt.label || "")
    );
  };

  // Expand all nodes
  const expandAll = () => {
    const allIds = new Set<number>();
    const collectIds = (items: ObjectItem[]) => {
      items.forEach((item) => {
        if (item.objectId && item.children && item.children.length > 0) {
          allIds.add(item.objectId);
          collectIds(item.children);
        }
      });
    };
    collectIds(filteredObjectTree);
    setExpandedNodes(allIds);
  };

  // Collapse all nodes
  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Recursive component for tree node
  const ObjectTreeNode = ({
    obj,
    level = 0,
  }: {
    obj: ObjectItem;
    level?: number;
  }) => {
    const hasChildren = !!(obj.children && obj.children.length > 0);
    const isExpanded = obj.objectId ? expandedNodes.has(obj.objectId) : false;

    const canAddChild =
      obj.objectTypeName === "MAIN_MENU" ||
      obj.objectTypeName === "MENU" ||
      obj.objectTypeName === "SUB_MENU" ||
      obj.objectTypeName === "SCREEN";

    // Different colors for different levels
    const levelColors = [
      "bg-white",
      "bg-blue-50/30",
      "bg-indigo-50/30",
      "bg-purple-50/30",
    ];
    const bgColor = levelColors[level] || levelColors[3];

    return (
      <div>
        <div
          className={`mb-2 rounded-xl border ${
            level === 0 ? "border-gray-300" : "border-gray-200"
          } ${bgColor} p-4 shadow-sm transition-all hover:border-gray-400 hover:shadow-md ${
            level === 0 ? "font-semibold" : ""
          }`}
          style={{ marginLeft: `${level * 24}px` }}
        >
          <div className="flex items-start gap-3">
            {/* Toggle button */}
            <div className="flex-shrink-0 mt-0.5">
              {hasChildren ? (
                <button
                  onClick={() => obj.objectId && toggleNode(obj.objectId)}
                  className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors"
                >
                  {isExpanded ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-gray-600"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-gray-600"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ) : (
                <div className="w-7 h-7" />
              )}
            </div>

            {/* Icon */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
              hasChildren
                ? "bg-indigo-100 border-indigo-200"
                : "bg-gray-50 border-gray-200"
            }`}>
              <span className="text-lg">
                {hasChildren
                  ? isExpanded
                    ? "📂"
                    : "📁"
                  : obj.objectTypeName === "MENU"
                  ? "📄"
                  : obj.objectTypeName === "SUB_MENU"
                  ? "📝"
                  : obj.objectTypeName === "BUTTON"
                  ? "🔘"
                  : obj.objectTypeName === "TAB"
                  ? "🗂️"
                  : obj.objectTypeName === "SCREEN"
                  ? "🖥️"
                  : "📋"}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                {obj.objectName || "-"}
                {/* ปุ่มแก้ไข */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const displayObj: ObjectDisplay = {
                      id: obj.objectId || 0,
                      name: obj.objectName || "",
                      path: obj.path,
                      typeName: obj.objectTypeName,
                      parentObjectId: obj.parentObjectId,
                      hasChildren: hasChildren,
                      icon: "📁",
                      color: "bg-indigo-50",
                    };
                    handleEditObject(displayObj);
                  }}
                  className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors"
                  title="แก้ไข"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3.5 w-3.5 text-gray-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                {/* ปุ่มเพิ่มเมนูย่อย */}
                {canAddChild && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddChildMenu(obj);
                    }}
                    className="rounded-lg p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
                    title="เพิ่มเมนูย่อย"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </button>
                )}
                {/* ปุ่มลบ */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteObject(obj);
                  }}
                  className="rounded-lg p-1.5 bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                  title="ลบเมนู"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {obj.objectId && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md font-medium">
                    ID: {obj.objectId}
                  </span>
                )}
                {obj.objectTypeName && (
                  <span className="px-2 py-1 bg-indigo-600 text-white rounded-md font-medium">
                    {obj.objectTypeName}
                  </span>
                )}
                {hasChildren && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded-md font-medium">
                    📂 {obj.children?.length} รายการย่อย
                  </span>
                )}
              </div>
              {obj.path && (
                <div className="mt-2 text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-200">
                  {obj.path}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="relative">
            {/* Connecting line */}
            {level < 3 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-gray-200"
                style={{ left: `${level * 24 + 12}px` }}
              />
            )}
            {obj.children?.map((child) => (
              <div key={child.objectId} className="relative">
                {/* Horizontal line */}
                {level < 3 && (
                  <div
                    className="absolute h-0.5 bg-gray-200"
                    style={{
                      left: `${level * 24 + 12}px`,
                      top: "20px",
                      width: "12px",
                    }}
                  />
                )}
                <ObjectTreeNode obj={child} level={level + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-white">
      {/* Breadcrumb / top bar */}
      <div className="border-b border-gray-100 bg-white">
        <div className="w-full px-8 py-3">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => router.push("/")}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Home
            </button>
            <span className="text-gray-400">/</span>
            <button
              onClick={() => router.push("/settings")}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Settings
            </button>
            <span className="text-gray-400">/</span>
            <button
              onClick={() => router.push("/settings/app")}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Applications
            </button>
            {urlAppName && (
              <>
                <span className="text-gray-400">/</span>
                <span className="text-gray-600">{urlAppName}</span>
              </>
            )}
            <span className="text-gray-400">/</span>
            <button
              onClick={() => router.back()}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Modules
            </button>
            {urlModuleName && (
              <>
                <span className="text-gray-400">/</span>
                <span className="text-gray-600">{urlModuleName}</span>
              </>
            )}
            <span className="text-gray-400">/</span>
            <span className="font-semibold text-gray-900">Objects</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="w-full px-8 py-6">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <button
                className="rounded-xl p-2 text-gray-500 hover:bg-gray-50"
                title="Back"
                aria-label="Back"
                onClick={() => router.back()}
              >
                ←
              </button>

              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500 text-xl font-bold text-white">
                  O
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Objects{urlModuleName && ` - ${urlModuleName}`}
                  </h1>
                  <p className="text-sm text-gray-600">
                    {urlModuleName
                      ? `จัดการเมนูสำหรับโมดูล ${urlModuleName}`
                      : "จัดการเมนูทั้งหมด"}
                  </p>
                </div>
              </div>
            </div>

            <button
              className="rounded-xl p-2 text-gray-500 hover:bg-gray-50"
              aria-label="settings"
              title="Settings"
            >
              ⚙️
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full px-8 py-6">
        {/* Stat cards row */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600">
                  Total Objects
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {counts.total}
                </p>
                <p className="mt-3 text-sm text-gray-500">
                  เมนูทั้งหมดในโมดูล
                </p>
              </div>
              <IconTile className="bg-indigo-50 text-indigo-700">📋</IconTile>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600">
                  Menu Items
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {counts.menus}
                </p>
                <p className="mt-3 text-sm text-gray-500">เมนูหลัก</p>
              </div>
              <IconTile className="bg-emerald-50 text-emerald-700">📁</IconTile>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600">
                  Sub Menu Items
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {counts.subMenus}
                </p>
                <p className="mt-3 text-sm text-gray-500">เมนูย่อย</p>
              </div>
              <IconTile className="bg-amber-50 text-amber-700">📄</IconTile>
            </div>
          </Card>
        </div>

        {/* Controls bar */}
        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-[360px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                🔎
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาเมนู..."
                className="w-full rounded-xl border border-gray-200 bg-white px-10 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            {/* Expand/Collapse buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={expandAll}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
                title="ขยายทั้งหมด"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
                ขยายทั้งหมด
              </button>
              <button
                onClick={collapseAll}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
                title="ยุบทั้งหมด"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 15l7-7 7 7"
                  />
                </svg>
                ยุบทั้งหมด
              </button>
            </div>
          </div>

          <button
            onClick={async () => {
              setEditingObjectId(null);
              setObjectName("");
              setObjectPath("");
              setObjectTypeId("");
              setParentObjectId("");
              setParentObjectName("");
              setParentObjectType(null);
              // Load parent object options
              if (urlModuleId) {
                await fetchParentObjectOptions(parseInt(urlModuleId));
                await fetchMenuParentObjectOptions(parseInt(urlModuleId));
              }
              setShowObjectModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <span className="grid h-5 w-5 place-items-center rounded-md bg-white/15">
              +
            </span>
            เพิ่มเมนู
          </button>
        </div>

        {/* Objects section - full width */}
        <div className="mt-6">
          <Card>
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">
                  รายการเมนู
                </h3>
              </div>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="grid place-items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-14 text-center">
                  <div className="text-3xl animate-pulse">⏳</div>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    กำลังโหลด...
                  </p>
                </div>
              ) : filteredObjectTree.length === 0 ? (
                <div className="grid place-items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-14 text-center">
                  <div className="text-3xl">📦</div>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    {search ? "ไม่พบข้อมูลที่ค้นหา" : "ไม่มี Objects ในโมดูลนี้"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {search
                      ? "ลองเปลี่ยนคำค้นหา"
                      : "คลิกปุ่ม 'เพิ่มเมนู' เพื่อเพิ่มเมนูใหม่"}
                  </p>
                </div>
              ) : (
                <div>
                  {filteredObjectTree.map((obj) => (
                    <ObjectTreeNode key={obj.objectId} obj={obj} />
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal สำหรับเพิ่ม/แก้ไขเมนู */}
      {showObjectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => {
            setShowObjectModal(false);
            setParentObjectName("");
            setParentObjectType(null);
            setEditingObjectId(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editingObjectId ? "แก้ไขเมนู" : "เพิ่มเมนูใหม่"}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  กรอกข้อมูลสำหรับสร้างเมนู
                </p>
              </div>
              <button
                onClick={() => {
                  setShowObjectModal(false);
                  setParentObjectName("");
                  setParentObjectType(null);
                  setEditingObjectId(null);
                }}
                className="rounded-xl p-2 text-gray-500 hover:bg-gray-50"
                aria-label="close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* Module name (read-only) */}
              {urlModuleName && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    โมดูล
                  </label>
                  <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 flex items-center gap-2">
                    <span className="text-lg">📦</span>
                    <span className="font-medium">{urlModuleName}</span>
                  </div>
                </div>
              )}

              {/* Parent object (read-only when adding child) */}
              {parentObjectName && !editingObjectId && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Parent Object
                  </label>
                  <div className="w-full rounded-xl border border-gray-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-700 flex items-center gap-2">
                    <span className="text-lg">📁</span>
                    <span className="font-medium">{parentObjectName}</span>
                    <span className="ml-auto text-xs text-indigo-500">
                      (ID: {parentObjectId})
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  ชื่อเมนู <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={objectName}
                  onChange={(e) => setObjectName(e.target.value)}
                  placeholder="ระบุชื่อเมนู"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  ประเภท <span className="text-red-500">*</span>
                </label>
                <select
                  value={objectTypeId}
                  onChange={(e) => {
                    setObjectTypeId(e.target.value);
                    // Only reset parentObjectId if not set from add child button
                    if (!parentObjectName) {
                      setParentObjectId("");
                    }
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">-- เลือกประเภท --</option>
                  {getFilteredObjectTypes().map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Parent Object selection for MENU and SUB_MENU */}
              {!parentObjectName && (() => {
                const isMenu = objectTypeId === "-98";
                const isSubMenu = objectTypeId === "-97";

                if (isMenu) {
                  return (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-700">
                        Parent Object <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={parentObjectId}
                        onChange={(e) => setParentObjectId(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
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
                      <label className="mb-2 block text-sm font-semibold text-gray-700">
                        Parent Object <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={parentObjectId}
                        onChange={(e) => setParentObjectId(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
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
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Path
                </label>
                <input
                  type="text"
                  value={objectPath}
                  onChange={(e) => setObjectPath(e.target.value)}
                  placeholder="เช่น /menu/submenu"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowObjectModal(false);
                  setParentObjectName("");
                  setParentObjectType(null);
                  setEditingObjectId(null);
                }}
                className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                disabled={saving}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveObject}
                disabled={
                  !objectName.trim() ||
                  !objectTypeId ||
                  saving ||
                  // Check parent object only if required
                  ((objectTypeId === "-97" || objectTypeId === "-98") &&
                    !parentObjectId &&
                    !parentObjectName)
                }
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {saving ? "กำลังบันทึก..." : editingObjectId ? "บันทึกการแก้ไข" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
