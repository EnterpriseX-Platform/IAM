"use client";

import React, { useEffect, useMemo, useState } from "react";
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

/** ===== Types (ตรงกับ Go ManageMenuResponse ใหม่) ===== */
type ManageMenuRow = {
  systemId: number | null;

  objectId: number;
  parentObjectId: number | null;
  objectSeq: number | null;

  objectName: string | null;
  objectCode: string | null;
  path: string | null;

  objectTypeName: string | null;
  status: string | null;

  createDate?: string;
  createBy?: number | null;
  updateDate?: string;
  updateBy?: number | null;
};

type MenuNode = ManageMenuRow & { children: MenuNode[] };

type SystemOption = { systemId: number; systemName: string };
type Option = { value: string; label: string };

type FormState = {
  objectName: string;
  objectCode: string;
  path: string;
  objectTypeId: string;
  status: string;

  // ✅ เปลี่ยนจาก systemId -> parentObjectId (เลือก MAIN_MENU/MENU ที่เป็น root)
  parentObjectId: string;

  // ✅ ใช้เมื่อสร้าง MAIN_MENU (parent=null) ต้องกำหนด system
  systemIdForMain: string;
};

const emptyForm: FormState = {
  objectName: "",
  objectCode: "",
  path: "",
  objectTypeId: "",
  status: "Y",
  parentObjectId: "",
  systemIdForMain: "",
};

type FlatMoveRow = {
  systemId: number | null;
  objectId: number;
  systemName: string | null;
  objectName: string | null;
};

type MoveNode = {
  key: string;
  title: string;
  objectId?: number;
  children?: MoveNode[];
};

const API_URL = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";

export default function ManageMenuPage() {
  const [, setRows] = useState<ManageMenuRow[]>([]);
  const [tree, setTree] = useState<MenuNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  // pagination state (client-side)
  const [page, setPage] = useState(1);
  const limit = 10;

  // ✅ เปลี่ยน filterSystemId -> filterRootId (เลือก MAIN_MENU หรือ MENU root)
  const [filterRootId, setFilterRootId] = useState<string>("");

  const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);
  const [objectTypeOptions, setObjectTypeOptions] = useState<Option[]>([]);

  // modal
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [, setModalMode] = useState<"add" | "edit" | null>(null);

  // dropdown per row
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  // ===== move modal (เก็บไว้ตามของเดิม) =====
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<ManageMenuRow | null>(null);
  const [moveTree, setMoveTree] = useState<MoveNode[]>([]);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveSelectedId, setMoveSelectedId] = useState<number | null>(null);
  const [expandedMoveSystems, setExpandedMoveSystems] = useState<Set<string>>(
    new Set(),
  );

  /** ===================== Helpers ===================== */
  const pickNum = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeManageMenu = (x: any): ManageMenuRow => ({
    systemId: pickNum(x.systemId ?? x.SYSTEM_ID ?? x.system_id),

    objectId: Number(x.objectId ?? x.OBJECT_ID ?? x.object_id),
    parentObjectId: pickNum(
      x.parentObjectId ?? x.PARENT_OBJECT_ID ?? x.parent_object_id,
    ),
    objectSeq: pickNum(x.objectSeq ?? x.OBJECT_SEQ ?? x.object_seq),

    objectName: x.objectName ?? x.OBJECT_NAME ?? x.object_name ?? null,
    objectCode: x.objectCode ?? x.OBJECT_CODE ?? x.object_code ?? null,
    path: x.path ?? x.PATH ?? null,

    objectTypeName:
      x.objectTypeName ?? x.OBJECT_TYPE_NAME ?? x.object_type_name ?? null,
    status: x.status ?? x.STATUS ?? null,

    createDate: x.createDate ?? x.CREATE_DATE ?? x.create_date ?? undefined,
    createBy: pickNum(x.createBy ?? x.CREATE_BY ?? x.create_by),
    updateDate: x.updateDate ?? x.UPDATE_DATE ?? x.update_date ?? undefined,
    updateBy: pickNum(x.updateBy ?? x.UPDATE_BY ?? x.update_by),
  });

  // ✅ MAIN_MENU จริงๆ ตามที่ user ระบุ
  const isMainMenu = (t?: string | null) =>
    (t || "").trim().toUpperCase() === "MAIN_MENU";

  // ✅ MENU root กรณีไม่มี MAIN_MENU
  const isRootMenu = (n: ManageMenuRow) =>
    n.parentObjectId == null &&
    (n.objectTypeName || "").trim().toUpperCase() === "MENU";

  // เดิมใช้เป็นหัวข้อใหญ่หลายแบบ — ตอนนี้ “หัวข้อใหญ่” = MAIN_MENU เท่านั้น
  const isMainHeaderType = (t?: string | null) => isMainMenu(t);

  const buildTreeFromFlat = (flat: ManageMenuRow[]): MenuNode[] => {
    const byId = new Map<number, MenuNode>();

    flat.forEach((r) => {
      if (!r?.objectId) return;
      byId.set(r.objectId, { ...r, children: [] });
    });

    // attach children
    byId.forEach((node) => {
      const pid = node.parentObjectId;
      if (pid != null && byId.has(pid)) {
        byId.get(pid)!.children.push(node);
      }
    });

    // ✅ Roots = MAIN_MENU (parent null) + MENU (parent null) ที่ไม่มี MAIN_MENU ก็ต้องโชว์
    const roots: MenuNode[] = [];
    byId.forEach((node) => {
      const type = (node.objectTypeName || "").trim().toUpperCase();
      if (
        node.parentObjectId == null &&
        (type === "MAIN_MENU" || type === "MENU")
      ) {
        roots.push(node);
      }
    });

    // sort recursively
    const sortRec = (arr: MenuNode[]) => {
      arr.sort((a, b) => {
        const as = a.objectSeq ?? 999999999;
        const bs = b.objectSeq ?? 999999999;
        if (as !== bs) return as - bs;
        return a.objectId - b.objectId;
      });
      arr.forEach((n) => n.children?.length && sortRec(n.children));
    };
    sortRec(roots);

    return roots;
  };

  const collectAllIds = (nodes: MenuNode[]) => {
    const ids: number[] = [];
    const walk = (arr: MenuNode[]) => {
      arr.forEach((n) => {
        ids.push(n.objectId);
        if (n.children?.length) walk(n.children);
      });
    };
    walk(nodes);
    return ids;
  };

  const toggleNode = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** ===================== Fetch ===================== */
  const fetchSystemOptions = async () => {
    try {
      const res = await fetch(`${API_URL}/iamx/api/systems/`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch systems");
      const result = await res.json();
      const data = result.data || result || [];
      setSystemOptions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching systems:", err);
    }
  };

  const fetchObjectTypeOptions = async () => {
    try {
      const res = await fetch(`${API_URL}/iamx/api/admin/options/object-types`, {
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

  const fetchManageMenus = async () => {
    try {
      setLoading(true);
      setError(null);

      // ✅ ดึงทั้งหมด แล้วค่อย filter ที่ FE (เพราะ dropdown เปลี่ยนเป็น root menu แล้ว)
      const url = `${API_URL}/iamx/api/manage-menus`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok)
        throw new Error(`Failed to fetch manage menus: ${res.statusText}`);

      const data = await res.json();

      const rawList = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : [];

      const flat = rawList
        .map(normalizeManageMenu)
        .filter((r: ManageMenuRow) => !!r.objectId);

      setRows(flat);

      const builtTree = buildTreeFromFlat(flat);
      setTree(builtTree);

      // expand roots
      setExpandedIds(new Set(builtTree.map((x) => x.objectId)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล",
      );
      console.error("Error fetching manage menus:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemOptions();
    fetchObjectTypeOptions();
    fetchManageMenus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ESC close modal */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (openMenuId == null) return;
      const target = e.target as HTMLElement;
      const inside = target.closest(`[data-rowmenu="${openMenuId}"]`);
      if (!inside) setOpenMenuId(null);
    };

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenuId]);

  /** ===================== Root dropdown options (MAIN_MENU + MENU root) ===================== */
  const rootOptions = useMemo(() => {
    return tree
      .filter(
        (r) => (r.objectTypeName || "").trim().toUpperCase() === "MAIN_MENU",
      )
      .map((r) => ({
        value: String(r.objectId),
        label: r.objectName || "-",
      }));
  }, [tree]);

  /** ===================== Filter by Root + search ===================== */
  const filteredTree = useMemo(() => {
    // 1) filter root id
    let base = tree;
    if (filterRootId) {
      base = base.filter((n) => String(n.objectId) === String(filterRootId));
    }

    // 2) search in subtree
    const q = searchTerm.trim().toLowerCase();
    if (!q) return base;

    const matchNode = (n: MenuNode) => {
      const text = [
        n.objectId?.toString(),
        n.objectName,
        n.objectCode,
        n.path,
        n.objectTypeName,
        n.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    };

    const filterRec = (nodes: MenuNode[]): MenuNode[] => {
      const out: MenuNode[] = [];
      for (const n of nodes) {
        const kids = filterRec(n.children || []);
        if (matchNode(n) || kids.length > 0) out.push({ ...n, children: kids });
      }
      return out;
    };

    return filterRec(base);
  }, [tree, searchTerm, filterRootId]);

  /** ===================== Client-side Pagination ===================== */
  const totalRoots = filteredTree.length;
  const totalPages = Math.ceil(totalRoots / limit);

  const paginatedTree = useMemo(() => {
    const start = (page - 1) * limit;
    const end = start + limit;
    return filteredTree.slice(start, end);
  }, [filteredTree, page, limit]);

  // Reset page เมื่อ filter/search เปลี่ยน
  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterRootId]);

  // ✅ เวลา search ให้ expand ทั้งหมดอัตโนมัติ
  useEffect(() => {
    if (!searchTerm.trim()) return;
    setExpandedIds(new Set(collectAllIds(paginatedTree)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  /** Expand / Collapse */
  const expandAll = () => setExpandedIds(new Set(collectAllIds(paginatedTree)));
  const collapseAll = () => setExpandedIds(new Set());

  /** ===================== Modal actions ===================== */
  const openAddModal = () => {
    setModalMode("add");
    // ✅ default ให้เลือก root ตาม filter (ถ้ามี)
    setForm({ ...emptyForm, parentObjectId: filterRootId || "" });
    setEditingId(null);
    setOpen(true);
  };

  const openEditModal = (menu: ManageMenuRow) => {
    setModalMode("edit");

    const found = objectTypeOptions.find(
      (x) => (x.label || "").trim() === (menu.objectTypeName || "").trim(),
    );

    // ✅ parentObjectId เอามาใส่เพื่อแก้ไข
    // ถ้า menu เป็น root (parent null) -> ให้ parentObjectId ว่าง
    setForm({
      objectName: menu.objectName || "",
      objectCode: menu.objectCode || "",
      path: menu.path || "",
      objectTypeId: found?.value || "",
      status: menu.status || "Y",
      parentObjectId:
        menu.parentObjectId != null ? String(menu.parentObjectId) : "",
      systemIdForMain: menu.systemId != null ? String(menu.systemId) : "",
    });

    setEditingId(menu.objectId);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setForm(emptyForm);
    setEditingId(null);
    setModalMode(null);
  };

  /** ===================== Validation ===================== */
  const validate = () => {
    if (!form.objectName.trim()) return "กรุณาระบุชื่อเมนู";
    if (!form.objectTypeId) return "กรุณาเลือกประเภท";

    // ถ้าเป็น MAIN_MENU (สร้างหัวข้อใหญ่) ต้องมี system
    const typeLabel =
      objectTypeOptions.find((x) => x.value === form.objectTypeId)?.label || "";
    if (isMainMenu(typeLabel) && !form.systemIdForMain) {
      return "กรุณาเลือกระบบ (สำหรับ MAIN_MENU)";
    }

    // ถ้าไม่ใช่ MAIN_MENU (เช่น MENU/SUB_MENU) แนะนำให้เลือก parent root
    // (ปล่อยว่างได้ถ้าคุณอยากให้เป็น root MENU)
    return null;
  };

  /** ===================== CRUD ===================== */
  const onSave = async () => {
    const err = validate();
    if (err) {
      showError("ข้อมูลไม่ครบถ้วน", err);
      return;
    }

    try {
      const selectedTypeLabel =
        objectTypeOptions.find((x) => x.value === form.objectTypeId)?.label ||
        "";
      const creatingMain = isMainMenu(selectedTypeLabel);

      // ✅ หา system_id จาก parent ที่เลือก (เพื่อให้ backend เดิมยังใช้ได้)
      let systemIdAuto: number | null = null;
      let parentIdAuto: number | null = null;

      if (creatingMain) {
        parentIdAuto = null;
        systemIdAuto = form.systemIdForMain
          ? Number(form.systemIdForMain)
          : null;
      } else {
        parentIdAuto = form.parentObjectId ? Number(form.parentObjectId) : null;
        if (parentIdAuto != null) {
          const parent = tree.find((x) => x.objectId === parentIdAuto);
          // parent root มี systemId อยู่ใน record
          systemIdAuto = parent?.systemId ?? null;
        }
        // ถ้าไม่เลือก parent และเป็น root MENU -> systemIdAuto จะ null (แล้วแต่ backend คุณรับได้ไหม)
      }

      const requestBody = {
        object_name: form.objectName.trim(),
        object_code: form.objectCode.trim() || null,
        path: form.path.trim() || null,
        object_type_id: form.objectTypeId ? parseInt(form.objectTypeId) : null,
        status: form.status || null,

        // ✅ ใช้ parent_object_id แทน logic เดิม
        parent_object_id: parentIdAuto,

        // ✅ backend เดิมยังอาจต้องใช้ system_id
        system_id: systemIdAuto,
      };

      const isEditing = editingId !== null;
      const url = isEditing
        ? `${API_URL}/iamx/api/manage-menus/${editingId}`
        : `${API_URL}/iamx/api/manage-menus/`;
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        let msg = `Failed to ${isEditing ? "update" : "create"} menu`;
        try {
          const e = await res.json();
          msg = e.message || e.error || msg;
        } catch {}
        throw new Error(msg);
      }

      await fetchManageMenus();
      closeModal();
      showSuccess(isEditing ? "แก้ไขสำเร็จ" : "เพิ่มสำเร็จ", isEditing ? "แก้ไขเมนูสำเร็จ" : "เพิ่มเมนูสำเร็จ");
    } catch (err) {
      showError("เกิดข้อผิดพลาด", err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึกเมนู");
      console.error("Error saving menu:", err);
    }
  };

  const onDelete = async (id: number) => {
    const confirmed = await showConfirm("ยืนยันการลบ", "ยืนยันการลบเมนูนี้?");
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_URL}/iamx/api/manage-menus/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        let msg = "Failed to delete menu";
        try {
          const e = await res.json();
          msg = e.message || e.error || msg;
        } catch {}
        throw new Error(msg);
      }

      await fetchManageMenus();
      showSuccess("ลบสำเร็จ", "ลบเมนูสำเร็จ");
    } catch (err) {
      showError("เกิดข้อผิดพลาด", err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการลบเมนู");
      console.error("Error deleting menu:", err);
    }
  };

  /** ===================== Move modal (คง logic เดิม) ===================== */
  const isMoveType = (t?: string | null) => {
    const x = (t || "").trim().toUpperCase();
    return x === "MENU" || x === "SUB_MENU";
  };

  const getMoveEndpointByType = (t?: string | null) => {
    const x = (t || "").trim().toUpperCase();
    if (x === "MENU") return `${API_URL}/iamx/api/manage-menus/simple`;
    if (x === "SUB_MENU") return `${API_URL}/iamx/api/manage-menus/menu-only`;
    return null;
  };

  const buildMoveTreeFromFlat = (list: FlatMoveRow[]): MoveNode[] => {
    const bySystem = new Map<string, FlatMoveRow[]>();

    list.forEach((r) => {
      const sys = r.systemName || "ไม่ระบุระบบ";
      if (!bySystem.has(sys)) bySystem.set(sys, []);
      bySystem.get(sys)!.push(r);
    });

    const out: MoveNode[] = [];
    for (const [sys, arr] of bySystem.entries()) {
      arr.sort((a, b) => a.objectId - b.objectId);
      out.push({
        key: `sys:${sys}`,
        title: sys,
        children: arr.map((m) => ({
          key: `obj:${m.objectId}`,
          objectId: m.objectId,
          title: m.objectName || "-",
        })),
      });
    }

    out.sort((a, b) => a.title.localeCompare(b.title));
    return out;
  };

  const openMoveModal = async (menu: ManageMenuRow) => {
    if (!isMoveType(menu.objectTypeName)) return;

    const endpoint = getMoveEndpointByType(menu.objectTypeName);
    if (!endpoint) return;

    setMoveTarget(menu);
    setMoveSelectedId(null);
    setMoveTree([]);
    setMoveError(null);
    setMoveOpen(true);

    try {
      setMoveLoading(true);

      const type = (menu.objectTypeName || "").trim().toUpperCase();
      const qs =
        type === "SUB_MENU" && menu.systemId != null
          ? `?system_id=${menu.systemId}`
          : "";

      const res = await fetch(`${endpoint}${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`โหลดตำแหน่งใหม่ไม่สำเร็จ (${res.status})`);

      const data = await res.json();
      const flat: FlatMoveRow[] = Array.isArray(data)
        ? data
        : (data?.data ?? []);
      const t = buildMoveTreeFromFlat(flat);

      setExpandedMoveSystems(new Set(t.map((x) => x.key)));
      setMoveTree(t);
    } catch (e: any) {
      setMoveError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setMoveLoading(false);
    }
  };

  const closeMoveModal = () => {
    setMoveOpen(false);
    setMoveTarget(null);
    setMoveTree([]);
    setMoveSelectedId(null);
    setMoveError(null);
    setExpandedMoveSystems(new Set());
  };

  const onConfirmMove = async () => {
    if (!moveTarget || !moveSelectedId) return;

    try {
      const type = (moveTarget.objectTypeName || "").trim().toUpperCase();

      const qs =
        type === "SUB_MENU" && moveTarget.systemId != null
          ? `?new_parent_id=${moveSelectedId}&system_id=${moveTarget.systemId}`
          : `?new_parent_id=${moveSelectedId}`;

      const url = `${API_URL}/iamx/api/manage-menus/${moveTarget.objectId}/move${qs}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        let msg = "ย้ายไม่สำเร็จ";
        try {
          const e = await res.json();
          msg = e.message || e.error || msg;
        } catch {}
        throw new Error(msg);
      }

      await fetchManageMenus();
      closeMoveModal();
      showSuccess("ย้ายสำเร็จ", "ย้ายข้อมูลสำเร็จ");
    } catch (e: any) {
      showError("เกิดข้อผิดพลาด", e?.message || "ย้ายไม่สำเร็จ");
    }
  };

  /** ✅ สีหัวข้อใหญ่ (MAIN_MENU เท่านั้น) */
  const mainHeaderTone = (objectId: number) => {
    const tones = [
      {
        tr: "bg-gradient-to-r from-blue-50 to-sky-50 border-blue-100",
        badge: "bg-blue-600 text-white",
        name: "text-blue-900",
      },
      {
        tr: "bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-100",
        badge: "bg-indigo-600 text-white",
        name: "text-indigo-900",
      },
      {
        tr: "bg-gradient-to-r from-sky-50 to-cyan-50 border-sky-100",
        badge: "bg-sky-600 text-white",
        name: "text-sky-900",
      },
    ];
    return tones[objectId % tones.length];
  };

  /** ===================== render recursive rows ===================== */
  const renderRows = (nodes: MenuNode[], depth = 0) => {
    return nodes.map((menu, idx) => {
      const hasChild = (menu.children?.length || 0) > 0;
      const expanded = expandedIds.has(menu.objectId);

      const isMainHeader = isMainHeaderType(menu.objectTypeName); // MAIN_MENU only
      const tone = isMainHeader ? mainHeaderTone(menu.objectId) : null;

      // indent สำหรับลูก
      const indentPx = isMainHeader ? 0 : depth * 18;

      return (
        <React.Fragment key={menu.objectId}>
          {depth === 0 && isMainHeader && idx > 0 && (
            <tr>
              <td colSpan={9} className="h-2 bg-gray-50" />
            </tr>
          )}

          <tr
            className={[
              "border-b hover:bg-gray-50",
              isMainHeader ? `border ${tone?.tr} hover:brightness-[0.99]` : "",
            ].join(" ")}
          >
            <td className="p-3 text-sm w-12">
              <div style={{ marginLeft: indentPx }}>
                {hasChild ? (
                  <button
                    onClick={() => toggleNode(menu.objectId)}
                    className={[
                      "p-1 rounded",
                      isMainHeader ? "hover:bg-white/70" : "hover:bg-gray-100",
                    ].join(" ")}
                    title={expanded ? "ย่อ" : "ขยาย"}
                  >
                    {expanded ? (
                      <ChevronDown size={18} />
                    ) : (
                      <ChevronRight size={18} />
                    )}
                  </button>
                ) : (
                  <span className="inline-block w-[18px]" />
                )}
              </div>
            </td>

            <td className="p-3 text-sm w-12">
              <div
                className="relative flex justify-center"
                data-rowmenu={menu.objectId}
              >
                <button
                  className={[
                    "p-1 rounded",
                    isMainHeader
                      ? "text-gray-700 hover:bg-white/70"
                      : "text-gray-600 hover:bg-gray-100",
                  ].join(" ")}
                  title="เมนู"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(
                      openMenuId === menu.objectId ? null : menu.objectId,
                    );
                  }}
                >
                  <MoreVertical size={18} />
                </button>

                {openMenuId === menu.objectId && (
                  <div className="absolute left-full top-0 w-40 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      {isMoveType(menu.objectTypeName) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            openMoveModal(menu);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <ChevronRight size={16} />
                          ย้ายข้อมูล
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(null);
                          openEditModal(menu);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Edit size={16} />
                        แก้ไข
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(null);
                          onDelete(menu.objectId);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                        ลบ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </td>

            <td className="p-3 text-sm">{idx + 1}</td>
            <td className="p-3 text-sm font-medium">{menu.objectId}</td>

            <td className="p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">
                  {isMainHeader ? "🗂️" : depth === 0 ? "📁" : "└─"}
                </span>

                <span
                  className={[
                    isMainHeader
                      ? `font-extrabold tracking-wide ${tone?.name} text-[15px]`
                      : "",
                  ].join(" ")}
                >
                  {menu.objectName || "-"}
                </span>

                {isMainHeader && (
                  <span
                    className={[
                      "ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold",
                      tone?.badge || "bg-blue-600 text-white",
                    ].join(" ")}
                    title="หัวข้อใหญ่"
                  >
                    MAIN_MENU
                  </span>
                )}

                {/* ✅ ถ้าเป็น MENU root (ไม่มี MAIN_MENU) ให้ติด badge ช่วยดู */}
                {!isMainHeader && depth === 0 && isRootMenu(menu) && (
                  <span
                    className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-700 text-white"
                    title="MENU ที่เป็น root (ไม่มี MAIN_MENU)"
                  >
                    ROOT MENU
                  </span>
                )}
              </div>
            </td>

            <td className="p-3 text-sm text-gray-700">
              {menu.objectCode || "-"}
            </td>
            <td className="p-3 text-sm text-gray-700">{menu.path || "-"}</td>
            <td className="p-3 text-sm text-gray-700">
              {menu.objectTypeName || "-"}
            </td>

            <td className="p-3 text-center whitespace-nowrap">
              <span
                className={`inline-flex items-center justify-center min-w-[92px] px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                  menu.status === "Y"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}
              >
                {menu.status === "Y" ? "เปิดใช้งาน" : "ปิดใช้งาน"}
              </span>
            </td>
          </tr>

          {hasChild && expanded && renderRows(menu.children, depth + 1)}
        </React.Fragment>
      );
    });
  };

  /** ===================== UI ===================== */
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <div className="flex-1 overflow-auto">
          {/* Header */}

          {/* Page Title */}
          <div className="bg-blue-600 text-white p-6">
            <h2 className="text-2xl font-bold">จัดการเมนู (Manage Menu)</h2>
          </div>

          {/* Search & Actions */}
          <div className="p-6">
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 mb-4">
                <div className="flex gap-3 flex-1">
                  <div className="relative flex-1 max-w-md">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      size={20}
                    />
                    <input
                      type="text"
                      placeholder="ค้นหาเมนู"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* ✅ เปลี่ยน dropdown: จากระบบ -> MAIN_MENU/MENU root */}
                  <select
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[260px]"
                    value={filterRootId}
                    onChange={(e) => setFilterRootId(e.target.value)}
                  >
                    <option value="">ทุก MAIN_MENU</option>
                    {rootOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
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
                    เพิ่มเมนู
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

              {loading && (
                <div className="text-center py-8 text-gray-500">
                  กำลังโหลดข้อมูล...
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              {!loading && !error && (
                <div className="overflow-x-auto">
                  <table className="cds--data-table cds--data-table--sm w-full min-w-[1100px]">
                    <thead className="bg-gray-100 border-b-2 border-gray-300">
                      <tr>
                        <th className="p-3 text-left text-sm font-medium w-12"></th>
                        <th className="p-3 text-left text-sm font-medium w-12"></th>
                        <th className="p-3 text-left text-sm font-medium">
                          ลำดับ
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          รหัสเมนู
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          ชื่อเมนู
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          รหัสเมนู (CODE)
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          URL (PATH)
                        </th>
                        <th className="p-3 text-left text-sm font-medium">
                          ประเภท
                        </th>
                        <th className="p-3 text-center text-sm font-medium whitespace-nowrap w-[120px]">
                          สถานะ
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {renderRows(paginatedTree, 0)}
                      {paginatedTree.length === 0 && (
                        <tr>
                          <td
                            colSpan={9}
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
                    {Math.min(page * limit, totalRoots)} จาก {totalRoots} รายการ
                    (root nodes)
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

          {/* ===== Modal (Add/Edit) ===== */}
          {open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={closeModal}
              />
              <div className="relative w-[560px] max-w-[92vw] rounded-lg bg-white shadow-lg">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <h3 className="text-lg font-semibold">
                    {editingId !== null ? "แก้ไข" : "เพิ่ม"}เมนู
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
                      <span className="text-red-500">*</span> ชื่อเมนู
                    </label>
                    <input
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="เช่น จัดการเมนู"
                      value={form.objectName}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, objectName: e.target.value }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">
                      รหัสเมนู (OBJECT_CODE)
                    </label>
                    <input
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="เช่น MENU_001"
                      value={form.objectCode}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, objectCode: e.target.value }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">URL (PATH)</label>
                    <input
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="เช่น /iamx/manageMenu"
                      value={form.path}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, path: e.target.value }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">
                      <span className="text-red-500">*</span> ประเภท
                      (OBJECT_TYPE_ID)
                    </label>
                    <select
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      value={form.objectTypeId}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, objectTypeId: e.target.value }))
                      }
                    >
                      <option value="">-- เลือกประเภท --</option>
                      {objectTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* ✅ เปลี่ยน “ระบบ” -> “กลุ่มหลัก (MAIN_MENU / ROOT MENU)” */}
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">
                      กลุ่มหลัก (MAIN_MENU / ROOT MENU)
                    </label>
                    <select
                      className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      value={form.parentObjectId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((p) => ({ ...p, parentObjectId: v }));
                        setFilterRootId(v); // sync filter
                      }}
                    >
                      <option value="">-- ไม่เลือก (จะเป็น ROOT เอง) --</option>
                      {rootOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-gray-500">
                      - ถ้าเลือก MAIN_MENU → เมนูใหม่จะไปเป็น “ลูก” ของ
                      MAIN_MENU
                      <br />- ถ้าไม่เลือก → เมนูใหม่จะเป็น ROOT
                      (เหมาะกับกรณีไม่มี MAIN_MENU)
                    </div>
                  </div>

                  {/* ✅ เฉพาะตอนสร้าง MAIN_MENU ต้องเลือก “ระบบ” (เพราะ parent = null) */}
                  {isMainMenu(
                    objectTypeOptions.find((x) => x.value === form.objectTypeId)
                      ?.label,
                  ) && (
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">
                        <span className="text-red-500">*</span> ระบบ (สำหรับ
                        MAIN_MENU)
                      </label>
                      <select
                        className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        value={form.systemIdForMain}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            systemIdForMain: e.target.value,
                          }))
                        }
                      >
                        <option value="">-- เลือกระบบ --</option>
                        {systemOptions.map((s) => (
                          <option key={s.systemId} value={s.systemId}>
                            {s.systemName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

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

          {/* ===== Move Modal (เดิม) ===== */}
          {moveOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={closeMoveModal}
              />
              <div className="relative w-[720px] max-w-[95vw] rounded-lg bg-white shadow-lg">
                <div className="flex items-start justify-between px-5 py-4 border-b">
                  <div>
                    <h3 className="text-lg font-semibold">
                      ย้ายเมนู: {moveTarget?.objectName || "-"}
                    </h3>
                    <div className="text-sm text-gray-600 mt-1">
                      เมนูที่จะย้าย: {moveTarget?.objectName || "-"}
                      <br />
                      ตำแหน่งปัจจุบัน: {moveTarget?.objectTypeName || "-"}
                    </div>
                  </div>
                  <button
                    className="text-gray-500 hover:text-gray-800"
                    onClick={closeMoveModal}
                    aria-label="close"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-5">
                  <div className="text-sm font-medium mb-3">
                    เลือกตำแหน่งใหม่:
                  </div>

                  <div className="h-[320px] overflow-auto rounded-lg border border-gray-200 p-3 bg-gray-50">
                    {moveLoading && (
                      <div className="text-sm text-gray-600">กำลังโหลด...</div>
                    )}
                    {!moveLoading && moveError && (
                      <div className="text-sm text-red-600">{moveError}</div>
                    )}
                    {!moveLoading && !moveError && moveTree.length === 0 && (
                      <div className="text-sm text-gray-600">ไม่พบข้อมูล</div>
                    )}

                    {!moveLoading && !moveError && moveTree.length > 0 && (
                      <div className="space-y-3">
                        {moveTree.map((sys) => {
                          const expanded = expandedMoveSystems.has(sys.key);
                          return (
                            <div
                              key={sys.key}
                              className="bg-white border rounded-lg"
                            >
                              <button
                                type="button"
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                                onClick={() => {
                                  setExpandedMoveSystems((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(sys.key)) next.delete(sys.key);
                                    else next.add(sys.key);
                                    return next;
                                  });
                                }}
                              >
                                <div className="text-sm font-medium text-gray-800">
                                  📁 {sys.title}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {expanded ? "ย่อ" : "ขยาย"}
                                </div>
                              </button>

                              {expanded && (
                                <div className="px-3 pb-3 space-y-2">
                                  {(sys.children || []).map((n) => {
                                    const disabled =
                                      moveTarget?.objectId === n.objectId;
                                    const selected =
                                      moveSelectedId === n.objectId;

                                    return (
                                      <div
                                        key={n.key}
                                        className={[
                                          "flex items-center justify-between rounded-md px-3 py-2 border",
                                          selected
                                            ? "bg-blue-50 border-blue-200"
                                            : "bg-white border-gray-200",
                                          disabled
                                            ? "opacity-50 cursor-not-allowed"
                                            : "cursor-pointer hover:bg-gray-50",
                                        ].join(" ")}
                                        onClick={() => {
                                          if (disabled) return;
                                          setMoveSelectedId(n.objectId || null);
                                        }}
                                      >
                                        <div className="text-sm text-gray-800">
                                          {n.title}
                                        </div>
                                        <button
                                          type="button"
                                          className="text-xs px-3 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (disabled) return;
                                            setMoveSelectedId(
                                              n.objectId || null,
                                            );
                                          }}
                                        >
                                          เลือก
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-5 py-4 border-t flex justify-end gap-2">
                  <button
                    className="h-10 px-4 rounded-md border bg-white hover:bg-gray-50"
                    onClick={closeMoveModal}
                  >
                    ยกเลิก
                  </button>
                  <button
                    className="h-10 px-4 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    disabled={!moveSelectedId}
                    onClick={onConfirmMove}
                  >
                    ย้าย
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ===== /Move Modal ===== */}
        </div>
      </div>
    </div>
  );
}
