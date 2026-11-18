"use client";
import { Checkbox } from "@/app/components/iamx/Check";

import { tx } from "@/lib/i18n";
import DomainsPage from "../domains/page";
import {
  Button,
  Drawer,
  DrawerSection,
  EmptyState,
  FormField,
  IconButton,
  Input,
  PageHeader,
  Select,
  Textarea,
  Toggle,
} from "@/app/components/iamx";
import { useAuth } from "@/app/contexts/AuthContext";
import MultiSelect from "@/app/components/MultiSelect";
import { showConfirm, showError, showSuccess } from "@/lib/swal";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Globe,
  GripVertical,
  LayoutGrid,
  Settings as SettingsIcon,
  Shield,
  X as XIcon,
} from "@/app/components/iamx/carbonLucide";
import { useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  batchUpdateApplicationOrder,
  batchUpdateModuleOrder,
  batchUpdateObjectOrder,
  createApplication,
  createModule,
  createObject,
  createProcessMapperBatch,
  deleteApplication,
  deleteModule,
  deleteObject,
  deleteProcessMapperByCodes,
  fetchAppHierarchy,
  fetchStructureChildrenCount,
  setStructureActive,
  fetchNextObjectCode,
  fetchObjectTypes,
  fetchObjects,
  fetchOracleProcesses,
  fetchProcessMappers,
  fetchRoles,
  invalidateUserMenuCache,
  updateApplication,
  updateModule,
  updateObject,
  type AppHierarchyModule,
  type AppHierarchyObject,
  type OracleProcess,
  type ProcessMapper,
  type RoleOption,
} from "./api";

type TreeItemType = "domain" | "application" | "module" | "object";

interface TreeItem {
  id: string;
  label: string;
  code?: string;
  type: TreeItemType;
  children?: TreeItem[];
  data: any;
  loaded?: boolean;
}

const TYPE_META: Record<TreeItemType, { label: string; color: string; icon: React.ElementType }> = {
  domain: { label: tx("โดเมน"), color: "text-[var(--iamx-fg-muted)]", icon: Globe },
  application: { label: tx("ระบบงาน"), color: "text-[var(--iamx-fg-muted)]", icon: LayoutGrid },
  module: { label: tx("โมดูล"), color: "text-[var(--iamx-fg-muted)]", icon: Folder },
  object: { label: tx("เมนู"), color: "text-[var(--iamx-fg-muted)]", icon: Shield },
};

const SafeIcon = ({ svg, className = "w-5 h-5" }: { svg?: string | null; className?: string }) => {
  if (!svg) return null;
  const cleanedSvg = svg
    .replace(/width="[^"]*"/g, "")
    .replace(/height="[^"]*"/g, "")
    .replace(/<svg/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: cleanedSvg }}
      // 13/11/69: ไอคอนที่บันทึกไว้เป็นสี → แสดงโทนเทาเหมือนไอคอนอื่นตามธีม Carbon
      style={{ display: "flex", alignItems: "center", justifyContent: "center", filter: "grayscale(1)", opacity: 0.8 }}
    />
  );
};

// 22/10/69: ย่อเยื้อง 16px/ระดับ ไม่มีเส้นนำ — ชื่อระดับ 3–4 ไม่ถูกตัดที่จอ 1024px
const TreeIndent = ({ depth }: { depth: number }) => {
  if (depth === 0) return null;
  return <div className="flex-shrink-0" style={{ width: `${depth * 16}px`, minHeight: "var(--iamx-row-h)" }} />;
};

interface SortableTreeItemProps {
  item: TreeItem;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  onToggleExpand: (e: React.MouseEvent) => void;
  onSelect: () => void;
  onAdd: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onToggleActive: (e: React.MouseEvent) => void;
  renderChildren: () => React.ReactNode;
}

function SortableTreeItem({
  item, depth, isExpanded, isSelected, hasChildren,
  onToggleExpand, onSelect, onToggleActive, renderChildren,
}: SortableTreeItemProps) {
  const off = !!item.data?._off || !!item.data?._offParent;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: item.type, item, depth },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isDraggable = item.type === "object" || item.type === "application" || item.type === "module";

  return (
    <div ref={setNodeRef} style={style} className="min-w-0">
      <div
        onClick={onSelect}
        className={
          "group/row flex items-center cursor-pointer relative transition-colors " +
          (isSelected ? "bg-[var(--iamx-bg-active)] shadow-[inset_3px_0_0_#0f62fe] font-medium" : "hover:bg-[var(--iamx-bg-hover)]")
        }
        style={{ minHeight: "var(--iamx-row-h)" }}
      >
        <TreeIndent depth={depth} />
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(e);
              }}
              className="w-4 h-4 inline-flex items-center justify-center text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)] flex-shrink-0"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          {isDraggable && (
            <span
              {...attributes}
              {...listeners}
              title={tx("ลากเพื่อจัดเรียง")}
              className="w-4 cursor-grab active:cursor-grabbing flex-shrink-0 text-[var(--iamx-fg-muted)] opacity-0 group-hover/row:opacity-100 transition-opacity"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
          )}
          
          <span
            className={"text-[13px] break-words flex-1 min-w-0 " + (depth <= 1 ? "font-medium " : "") + (off ? "text-[var(--iamx-fg-muted)]" : "text-[var(--iamx-fg)]")}
          >
            {item.label}
          </span>
          {item.data?._off && <span className="shrink-0 text-[11px] px-2 rounded-full bg-amber-100 text-amber-700">{tx("ปิดใช้งาน")}</span>}
          {item.data?._offParent && <span className="shrink-0 text-[11px] px-2 rounded-full bg-[var(--iamx-bg-hover)] text-[var(--iamx-fg-muted)]">{tx("ปิดตามระดับบน")}</span>}
          {item.code && (
            <span className="font-mono text-[11px] text-[var(--iamx-fg-muted)] hidden md:inline shrink-0">
              {item.code}
            </span>
          )}
          <span className="shrink-0 ml-2" onClick={(e) => e.stopPropagation()} title={item.data?._offParent ? tx("ปิดตามระดับบน — เปิดที่ระดับบนก่อน") : undefined}
            style={item.data?._offParent ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
            <Toggle size="sm" checked={!item.data?._off && !item.data?._offParent} onChange={() => onToggleActive({ stopPropagation() {} } as React.MouseEvent)} />
          </span>
                  </div>
      </div>
      {hasChildren && isExpanded && <div className="min-w-0">{renderChildren()}</div>}
    </div>
  );
}

interface AddFormState {
  type: "application" | "module" | "object";
  domain_id: string;
  application_id: string;
  is_shortcut: number;
  module_id: string;
  parent_object_id: string;
  code: string;
  name: string;
  description: string;
  path: string;
  icon: string;
  object_type_id: string;
}

const EMPTY_ADD: AddFormState = {
  type: "application",
  domain_id: "",
  application_id: "",
  is_shortcut: 0,
  module_id: "",
  parent_object_id: "",
  code: "",
  name: "",
  description: "",
  path: "",
  icon: "",
  object_type_id: "",
};

const defaultMenuType = (types: Array<{ value: string; label: string }>) =>
  (types.find((t) => /^MENU\b|เมนูหลัก/.test(t.label)) || types[0])?.value || "";

export default function AppsPage() {
  const { user } = useAuth();
  const [domainsOpen, setDomainsOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [openDomains, setOpenDomains] = useState<Set<string>>(new Set());
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const searchParams = useSearchParams();
  const domainIdFromQuery = searchParams.get("domainId");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<TreeItemType | null>(null);
  const [selectedData, setSelectedData] = useState<any>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [treeData, setTreeData] = useState<TreeItem[]>([]);
  const [searchValue, setSearchValue] = useState("");

  const [draggedItem, setDraggedItem] = useState<TreeItem | null>(null);
  const loadingRef = useRef(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addFromContext, setAddFromContext] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_ADD);
  const [editOpen, setEditOpen] = useState(false);
  const [editType, setEditType] = useState<TreeItemType | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    code: "", name: "", description: "", icon: "", path: "", object_type_id: "", is_shortcut: 0,
  });

  const [objectTypes, setObjectTypes] = useState<Array<{ value: string; label: string }>>([]);

  const [processMappers, setProcessMappers] = useState<ProcessMapper[]>([]);
  const [loadingProcesses, setLoadingProcesses] = useState(false);
  const [oracleProcesses, setOracleProcesses] = useState<OracleProcess[]>([]);
  const [showProcessMappingModal, setShowProcessMappingModal] = useState(false);
  const [processSearchQuery, setProcessSearchQuery] = useState("");
  const [selectedProcesses, setSelectedProcesses] = useState<Set<string>>(new Set());
  const [processPaths, setProcessPaths] = useState<Map<string, string>>(new Map());
  const [roleAssignments, setRoleAssignments] = useState<Map<string, string[]>>(new Map());
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<number>(0);

  const currentThaiYear = new Date().getFullYear() + 543;
  const fiscalYearOptions = Array.from({ length: 9 }, (_, i) => currentThaiYear - 3 + i);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    loadTreeData();
    setSelectedFiscalYear(currentThaiYear);
    fetchRoles().then(setRoles).catch((err) => console.error("Failed to fetch roles:", err));
  }, [domainIdFromQuery]);

  useEffect(() => {
    if (selectedData && (selectedType === "module" || selectedType === "object") && selectedData.id && selectedFiscalYear) {
      loadProcessMappers(selectedType, selectedData.id, selectedFiscalYear);
    } else {
      setProcessMappers([]);
    }
  }, [selectedData, selectedType]);

  const buildObjectTreeFromHierarchy = (
    objs: AppHierarchyObject[],
    mod: AppHierarchyModule,
    extraIds: { domain_id: number; application_id: number }
  ): TreeItem[] => {
    return objs.map((obj) => ({
      id: `obj-${obj.objectId}`,
      label: obj.name,
      code: obj.code,
      type: "object" as TreeItemType,
      data: {
        ...obj,
        id: obj.objectId,
        name: obj.name,
        description: "",
        path: obj.path ?? "",
        icon: "",
        object_type_id: obj.objectTypeId,
        parent_id: obj.parentObjectId ?? null,
        type: "object",
        moduleId: mod.id,
        module_id: mod.id,
        moduleName: mod.name,
        domain_id: extraIds.domain_id,
        application_id: extraIds.application_id,
      },
      children: obj.children?.length ? buildObjectTreeFromHierarchy(obj.children, mod, extraIds) : [],
      loaded: true,
    }));
  };

  const collectExpanded = (items: TreeItem[], acc: Set<string>) => {
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        acc.add(item.id);
        collectExpanded(item.children, acc);
      }
    }
  };

  const updateNodeInTree = (
    items: TreeItem[],
    targetId: string,
    updater: (item: TreeItem) => TreeItem
  ): TreeItem[] =>
    items.map((item) => {
      if (item.id === targetId) return updater(item);
      if (item.children) return { ...item, children: updateNodeInTree(item.children, targetId, updater) };
      return item;
    });

  const loadTreeData = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const hierarchy = await fetchAppHierarchy();
      const items: TreeItem[] = [];
      const allExpanded = new Set<string>();

      for (const domain of hierarchy) {
        const domainItem: TreeItem = {
          id: `domain-${domain.id}`,
          label: domain.name,
          code: domain.code,
          type: "domain",
          data: domain,
          children: [],
        };
        allExpanded.add(domainItem.id);

        for (const app of domain.applications || []) {
          const appItem: TreeItem = {
            id: `app-${app.id}`,
            label: app.name,
            code: app.code,
            type: "application",
            data: { ...app, domain_name: domain.name, domain_code: domain.code, domain_id: domain.id },
            children: [],
          };
          allExpanded.add(appItem.id);

          for (const mod of app.modules || []) {
            const extraIds = { domain_id: domain.id, application_id: app.id };
            const objChildren = buildObjectTreeFromHierarchy(mod.objects || [], mod, extraIds);
            const modItem: TreeItem = {
              id: `module-${mod.id}`,
              label: mod.name,
              code: mod.code,
              type: "module",
              data: { ...mod, application_name: app.name, application_code: app.code, domain_name: domain.name, domain_id: domain.id, application_id: app.id },
              children: objChildren,
              loaded: true,
            };
            allExpanded.add(modItem.id);
            collectExpanded(objChildren, allExpanded);
            appItem.children!.push(modItem);
          }
          domainItem.children!.push(appItem);
        }
        items.push(domainItem);
      }

      const markOff = (list: TreeItem[], parentOff: boolean) => list.forEach((it) => {
        const self = it.data?.is_active === 0;
        it.data._off = self;
        it.data._offParent = !self && parentOff;
        markOff(it.children || [], parentOff || self);
      });
      markOff(items, false);
      setTreeData(items);

      if (domainIdFromQuery && items.length > 0) {
        const targetDomain = items.find((d) => d.data.id === parseInt(domainIdFromQuery));
        if (targetDomain?.children?.length) {
          const firstApp = targetDomain.children[0];
          setSelectedId(firstApp.id);
          setSelectedType("application");
          setSelectedData(firstApp.data);
          setExpandedFolders(allExpanded);
        }
      } else if (items[0]?.children?.length) {
        const firstApp = items[0].children[0];
        setSelectedId(firstApp.id);
        setSelectedType("application");
        setSelectedData(firstApp.data);
        setExpandedFolders(allExpanded);
      } else {
        setExpandedFolders(allExpanded);
      }
    } catch (error) {
      console.error("Failed to load tree data:", error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const loadObjectsForModule = async (moduleItem: TreeItem): Promise<TreeItem[]> => {
    if (!moduleItem.data.id || moduleItem.loaded) return moduleItem.children || [];

    try {
      const objectsData = await fetchObjects(moduleItem.data.id);

      const buildObjectTree = (objs: any[]): TreeItem[] => {
        const sorted = [...objs].sort((a: any, b: any) => {
          const levelA = a.objectLevel ?? a.object_level ?? 0;
          const levelB = b.objectLevel ?? b.object_level ?? 0;
          if (levelA !== levelB) return levelA - levelB;
          const sortA = a.sortOrder ?? a.sort_order ?? 0;
          const sortB = b.sortOrder ?? b.sort_order ?? 0;
          if (sortA !== sortB) return sortA - sortB;
          const idA = a.objectId ?? a.id ?? a.ID ?? 0;
          const idB = b.objectId ?? b.id ?? b.ID ?? 0;
          return idA - idB;
        });

        return sorted.map((obj: any) => {
          const objId = Number(obj.objectId ?? obj.id ?? obj.ID);
          const objCode = obj.code ?? obj.Code ?? String(objId);
          const objName = obj.objectName ?? obj.name ?? obj.Name ?? "-";
          const parentIdValue = obj.parentObjectId ?? obj.parent_id ?? obj.parentId ?? null;
          const apiChildren = obj.children ?? [];
          const children = apiChildren.length > 0 ? buildObjectTree(apiChildren) : [];

          return {
            id: `obj-${objId}`,
            label: objName,
            code: objCode,
            type: "object" as TreeItemType,
            data: {
              ...obj,
              id: objId,
              code: objCode,
              name: objName,
              description: obj.description ?? "",
              path: obj.path ?? "",
              icon: obj.icon ?? "",
              object_type_id: obj.objectTypeId ?? obj.object_type_id,
              parent_id: parentIdValue ? Number(parentIdValue) : null,
              type: "object",
              moduleId: moduleItem.data.id,
              moduleName: moduleItem.data.name || moduleItem.data.code,
            },
            children,
            loaded: true,
          };
        });
      };

      return buildObjectTree(objectsData ?? []);
    } catch (error) {
      console.error("Failed to load objects:", error);
      return [];
    }
  };

  const loadProcessMappers = async (type: "module" | "object", id: number, fiscalYear?: number) => {
    try {
      setLoadingProcesses(true);
      const year = fiscalYear || selectedFiscalYear || currentThaiYear;
      const params = type === "module" ? { module_id: id, fiscal_year: year } : { object_id: id, fiscal_year: year };
      const mappers = await fetchProcessMappers(params);
      setProcessMappers(mappers);
    } catch (err) {
      console.error("Failed to load process mappers:", err);
      setProcessMappers([]);
    } finally {
      setLoadingProcesses(false);
    }
  };

  const handleToggleExpand = async (e: React.MouseEvent, item: TreeItem) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedFolders);
    const isExpanding = !newExpanded.has(item.id);

    if (isExpanding) {
      newExpanded.add(item.id);
      if (item.type === "module" && !item.loaded) {
        const children = await loadObjectsForModule(item);
        const updateTree = (items: TreeItem[]): TreeItem[] =>
          items.map((treeItem) => {
            if (treeItem.id === item.id) return { ...treeItem, children, loaded: true };
            if (treeItem.children) return { ...treeItem, children: updateTree(treeItem.children) };
            return treeItem;
          });
        setTreeData(updateTree(treeData));
      }
    } else {
      newExpanded.delete(item.id);
    }
    setExpandedFolders(newExpanded);
  };

  const handleSelect = (item: TreeItem) => {
    setInspectorOpen(true);
    setSelectedId(item.id);
    setSelectedType(item.type);
    setSelectedData(item.data);
  };

  const handleToggleActive = async (type?: TreeItemType, data?: any) => {
    const t = type ?? selectedType;
    const d = data ?? selectedData;
    if (!t || !d) return;
    const id = Number(d.objectId || d.id);
    const turnOn = !!d._off;
    const name = d.name || d.code;
    const n = turnOn ? 0 : await fetchStructureChildrenCount(t, id);
    const ok = await showConfirm(
      tx("ยืนยันการ{0}ใช้งาน{1}", turnOn ? tx("เปิด") : tx("ปิด"), TYPE_META[t].label),
      turnOn ? tx("คุณต้องการเปิดใช้งาน \"{0}\" ใช่หรือไม่?", name) : tx("คุณต้องการปิดใช้งาน \"{0}\"{1} ใช่หรือไม่?", name, n ? tx("(รวมรายการลูก {0} รายการ)", n) : ""),
      tx("ยืนยัน")
    );
    if (!ok) return;
    try {
      await setStructureActive(t, id, turnOn);
      await loadTreeData();
      if (selectedData && selectedType === t && selectedData.id === d.id) setSelectedData({ ...selectedData, _off: !turnOn, is_active: turnOn ? 1 : 0 });
      showSuccess(turnOn ? tx("เปิดใช้งานแล้ว") : tx("ปิดใช้งานแล้ว"));
    } catch {
      showError(tx("ทำรายการไม่สำเร็จ"), "");
    }
  };

  const handleDelete = async (type?: TreeItemType, data?: any) => {
    const t = type ?? selectedType;
    const d = data ?? selectedData;
    if (!t || !d) return;
    const itemName = d.name || d.code || d.objectName;
    const confirmed = await showConfirm(
      tx("ยืนยันการลบ{0}", TYPE_META[t]?.label ?? ""),
      tx("คุณต้องการลบ \"{0}\" ใช่หรือไม่?", itemName)
    );
    if (!confirmed) return;

    try {
      if (t === "application") await deleteApplication(d.id);
      else if (t === "module") await deleteModule(d.id);
      else if (t === "object") await deleteObject(d.objectId || d.id);
      if (selectedData && (selectedData.id === d.id || selectedData.objectId === d.objectId)) {
        setSelectedData(null);
        setSelectedId(null);
        setSelectedType(null);
      }
      loadTreeData();
      showSuccess(tx("ลบสำเร็จ"));
    } catch (error) {
      console.error("Failed to delete:", error);
      showError(tx("ไม่สามารถลบได้"), tx("เนื่องจากมีข้อมูลที่เกี่ยวข้อง"));
    }
  };

  const openAddManual = () => {
    setAddFromContext(false);
    setAddForm({ ...EMPTY_ADD });
    setAddOpen(true);
  };

  const openAddFromNode = async (type: TreeItemType, parent: any) => {
    const next: AddFormState = { ...EMPTY_ADD, type: type as AddFormState["type"] };

    if (type === "application") {
      next.domain_id = String(parent.id);
    } else if (type === "module") {
      next.domain_id = String(parent.domain_id || "");
      next.application_id = String(parent.id);
    } else if (type === "object") {
      if (parent.type === "module" || (!parent.objectId && !parent.object_id && parent.id && !parent.parent_id)) {
        next.module_id = String(parent.id || parent.module_id);
        next.application_id = String(parent.application_id || "");
        next.domain_id = String(parent.domain_id || "");
      } else if (parent.objectId || parent.object_id || parent.id) {
        const modId = String(parent.module_id || parent.moduleId || "");
        next.module_id = modId;
        next.parent_object_id = String(parent.objectId || parent.object_id || parent.id);
        // Walk tree to find application + domain for this module
        for (const dom of treeData) {
          const app = dom.children?.find((a) => a.children?.some((m) => String(m.data.id) === modId));
          if (app) {
            next.domain_id = String(dom.data.id);
            next.application_id = String(app.data.id);
            break;
          }
        }
      }

      try {
        const types = await fetchObjectTypes();
        setObjectTypes(types);
        // 13/11/69: ค่าเริ่มต้น = เมนูหลัก ไม่ต้องเลือกเองทุกครั้ง
        if (!next.object_type_id) next.object_type_id = defaultMenuType(types);
        const moduleIdNum = Number(next.module_id);
        const parentObjectId = next.parent_object_id ? Number(next.parent_object_id) : null;
        const autoCode = await fetchNextObjectCode(moduleIdNum, parentObjectId);
        next.code = autoCode;
      } catch (e) {
        console.error("Failed to prep object form:", e);
      }
    }

    setAddFromContext(true);
    setAddForm(next);
    setAddOpen(true);
  };

  const handleAddTypeChange = async (type: AddFormState["type"]) => {
    const next: AddFormState = { ...addForm, type, code: "", name: "" };
    if (type !== "object") {
      next.object_type_id = "";
      next.parent_object_id = "";
      next.path = "";
    }
    setAddForm(next);

    if (type === "object") {
      try {
        const types = objectTypes.length ? objectTypes : await fetchObjectTypes();
        setObjectTypes(types);
        if (!next.object_type_id) setAddForm((p) => ({ ...p, object_type_id: p.object_type_id || defaultMenuType(types) }));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const domainOptions = useMemo(
    () => treeData.map((d) => ({ value: String(d.data.id), label: `${d.data.code} — ${d.data.name}` })),
    [treeData]
  );
  const appOptionsFor = (domainId: string) => {
    const dom = treeData.find((d) => String(d.data.id) === domainId);
    return (dom?.children || []).map((a) => ({ value: String(a.data.id), label: `${a.data.code} — ${a.data.name}` }));
  };
  const moduleOptionsFor = (domainId: string, appId: string) => {
    const dom = treeData.find((d) => String(d.data.id) === domainId);
    const app = dom?.children?.find((a) => String(a.data.id) === appId);
    return (app?.children || []).map((m) => ({ value: String(m.data.id), label: `${m.data.code} — ${m.data.name}` }));
  };
  const objectOptionsFor = (domainId: string, appId: string, moduleId: string) => {
    const dom = treeData.find((d) => String(d.data.id) === domainId);
    const app = dom?.children?.find((a) => String(a.data.id) === appId);
    const mod = app?.children?.find((m) => String(m.data.id) === moduleId);
    const out: Array<{ value: string; label: string }> = [];
    const walk = (items: TreeItem[], prefix: string) => {
      for (const o of items) {
        const label = `${prefix}${o.data.code || ""} — ${o.data.name || o.label}`;
        out.push({ value: String(o.data.id || o.data.objectId), label });
        if (o.children?.length) walk(o.children, prefix + "  ");
      }
    };
    walk(mod?.children || [], "");
    return out;
  };

  const handleSaveNew = async () => {
    const f = addForm;
    if (!f.name.trim()) return showError(tx("กรุณากรอก"), tx("ชื่อจำเป็น"));
    if (f.type !== "object" && !f.code.trim()) return showError(tx("กรุณากรอก"), tx("รหัสจำเป็น"));

    try {
      if (f.type === "application") {
        if (!f.domain_id) return showError(tx("กรุณาเลือก"), tx("โดเมน"));
        await createApplication({
          domain_id: Number(f.domain_id),
          code: f.code,
          name: f.name,
          description: f.description,
          is_active: 1,
          icon: f.icon || undefined,
        });
        setExpandedFolders((p) => new Set([...p, `domain-${f.domain_id}`]));
      } else if (f.type === "module") {
        if (!f.application_id) return showError(tx("กรุณาเลือก"), "Application");
        await createModule({
          application_id: Number(f.application_id),
          code: f.code,
          name: f.name,
          description: f.description,
          is_active: 1,
          icon: f.icon || undefined,
        });
        setExpandedFolders((p) => new Set([...p, `app-${f.application_id}`]));
      } else if (f.type === "object") {
        if (!f.module_id) return showError(tx("กรุณาเลือก"), "Module");
        if (!f.object_type_id) return showError(tx("กรุณาเลือก"), tx("ประเภทเมนู"));
        const moduleId = Number(f.module_id);
        const parentObjectId = f.parent_object_id ? Number(f.parent_object_id) : null;
        await createObject(moduleId, {
          code: f.code,
          name: f.name,
          path: f.path || f.code.toLowerCase(),
          object_type_id: parseInt(f.object_type_id) || 1,
          parent_id: parentObjectId,
          icon: f.icon || undefined,
          is_shortcut: f.is_shortcut,
        });
        if (parentObjectId) {
          setExpandedFolders((p) => new Set([...p, `obj-${parentObjectId}`]));
        } else {
          setExpandedFolders((p) => new Set([...p, `module-${moduleId}`]));
        }
      }
      setAddOpen(false);
      await loadTreeData();
      showSuccess(tx("สร้างสำเร็จ"));
    } catch (error) {
      console.error("Failed to create:", error);
      showError(tx("ไม่สามารถสร้างได้"), (error as Error).message);
    }
  };

  const openEditDrawer = async (type: TreeItemType, data: any) => {
    setEditType(type);
    setEditData(data);
    setEditForm({
      code: data.code || "",
      name: data.name || "",
      description: data.description || "",
      icon: data.icon || "",
      path: data.path || "",
      object_type_id: data.object_type_id?.toString() || data.objectTypeId?.toString() || "",
      is_shortcut: data.is_shortcut ?? 0,
    });

    if (type === "object" && objectTypes.length === 0) {
      try {
        const types = await fetchObjectTypes();
        setObjectTypes(types);
      } catch (error) {
        console.error("Failed to load object types:", error);
      }
    }
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editData || !editType) return;
    try {
      if (editType === "application") {
        await updateApplication(editData.id, {
          code: editForm.code,
          name: editForm.name,
          description: editForm.description,
          icon: editForm.icon || undefined,
        });
      } else if (editType === "module") {
        await updateModule(editData.id, {
          code: editForm.code,
          name: editForm.name,
          description: editForm.description,
          icon: editForm.icon || undefined,
        });
      } else if (editType === "object") {
        await updateObject(editData.objectId || editData.id, {
          code: editForm.code,
          name: editForm.name,
          path: editForm.path || editForm.code.toLowerCase(),
          object_type_id: parseInt(editForm.object_type_id) || editData.object_type_id || editData.objectTypeId || 1,
          parent_id: editData.parent_id ? Number(editData.parent_id) : null,
          icon: editForm.icon || undefined,
          is_shortcut: editForm.is_shortcut,
        });
      }
      const savedTypeId = editType === "object" ? (parseInt(editForm.object_type_id) || editData.object_type_id || editData.objectTypeId) : undefined;
      const updatedData = {
        ...editData,
        code: editForm.code,
        name: editForm.name,
        description: editForm.description,
        icon: editForm.icon,
        path: editForm.path,
        ...(editType === "object" ? { object_type_id: savedTypeId, objectTypeId: savedTypeId, is_shortcut: editForm.is_shortcut } : {}),
      };
      const editItemId =
        editType === "object"
          ? `obj-${editData.objectId || editData.id}`
          : editType === "module"
          ? `module-${editData.id}`
          : `app-${editData.id}`;
      setTreeData((prev) =>
        updateNodeInTree(prev, editItemId, (item) => ({
          ...item,
          label: editForm.name,
          code: editForm.code,
          data: updatedData,
        }))
      );
      if (selectedId === editItemId) setSelectedData(updatedData);
      setEditOpen(false);
      showSuccess(tx("บันทึกสำเร็จ"));
    } catch (error) {
      console.error("Failed to save:", error);
      showError(tx("ไม่สามารถบันทึกได้"), (error as Error).message);
    }
  };

  const openProcessMappingModal = async () => {
    try {
      const processes = await fetchOracleProcesses(selectedFiscalYear.toString());
      setOracleProcesses(processes);

      // Prefill from what is already mapped so an existing URL Path / role
      // restriction can be edited instead of silently reset on save.
      const existingPaths = new Map<string, string>();
      const existingRoles = new Map<string, string[]>();
      const existingKeys = new Set<string>();
      for (const m of processMappers) {
        const key = `${m.process_code}|${m.subprocess_code}`;
        existingKeys.add(key);
        const fallback = m.display_component?.trim().startsWith("/") ? m.display_component.trim() : "";
        existingPaths.set(key, (m.url ?? "").trim() || fallback);
        existingRoles.set(key, m.allowed_role_ids || []);
      }

      setSelectedProcesses(existingKeys);
      setProcessPaths(existingPaths);
      setRoleAssignments(existingRoles);
      setProcessSearchQuery("");
      setShowProcessMappingModal(true);
    } catch (err) {
      console.error("Failed to fetch Oracle processes:", err);
      showError(tx("เกิดข้อผิดพลาด"), tx("ไม่สามารถโหลดรายการ Process จาก Oracle ได้"));
    }
  };

  const toggleProcessSelection = (processCode: string, subProcessCode: string) => {
    const key = `${processCode}|${subProcessCode}`;
    setSelectedProcesses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
        setProcessPaths((prevPaths) => {
          const newPaths = new Map(prevPaths);
          newPaths.delete(key);
          return newPaths;
        });
        setRoleAssignments((prevRoles) => {
          const newRoles = new Map(prevRoles);
          newRoles.delete(key);
          return newRoles;
        });
      } else {
        newSet.add(key);
        setProcessPaths((prevPaths) => {
          const newPaths = new Map(prevPaths);
          newPaths.set(key, "");
          return newPaths;
        });
        setRoleAssignments((prevRoles) => {
          const newRoles = new Map(prevRoles);
          newRoles.set(key, []);
          return newRoles;
        });
      }
      return newSet;
    });
  };

  const updateProcessPath = (key: string, path: string) => {
    setProcessPaths((prev) => {
      const newPaths = new Map(prev);
      newPaths.set(key, path);
      return newPaths;
    });
  };

  const updateProcessRoles = (key: string, roleIds: string[]) => {
    setRoleAssignments((prev) => {
      const newRoles = new Map(prev);
      newRoles.set(key, roleIds);
      return newRoles;
    });
  };

  const handleAddProcessMapping = async () => {
    if (!selectedData?.id || selectedProcesses.size === 0) return;

    try {
      const items = Array.from(selectedProcesses).map((key) => {
        const [processCode, subProcessCode] = key.split("|");
        const process = oracleProcesses.find(
          (p) => p.process_code === processCode && p.subprocess_code === subProcessCode
        );
        const customPath = processPaths.get(key) || process?.display_component || "";
        return {
          process_id: process?.process_id || "",
          subprocess_id: process?.subprocess_id || "",
          display_component: customPath,
          process_code: processCode,
          subprocess_code: subProcessCode,
          display_text: process?.display_text || "",
          // url is what the menu API returns as processes[].path — the portal
          // switches the iframe on it. Without this the path never reaches the
          url: customPath,
          allowed_role_ids: roleAssignments.get(key) || [],
        };
      });

      const moduleId =
        selectedType === "module"
          ? selectedData.id
          : selectedType === "object"
          ? selectedData.moduleId || selectedData.module_id
          : null;

      await createProcessMapperBatch({
        module_id: moduleId,
        object_id: selectedType === "object" ? selectedData.id : null,
        fiscal_year: selectedFiscalYear,
        items,
      });

      showSuccess(tx("เชื่อมโยงสำเร็จ"), tx("เชื่อมโยง {0} Process สำเร็จ", items.length));
      setShowProcessMappingModal(false);
      setProcessPaths(new Map());
      setRoleAssignments(new Map());

      if (selectedType && selectedData.id && (selectedType === "module" || selectedType === "object")) {
        loadProcessMappers(selectedType, selectedData.id);
      }
      if (user?.userId) {
        try {
          await invalidateUserMenuCache(user.userId);
        } catch (cacheErr) {
          console.error("Failed to invalidate cache:", cacheErr);
        }
      }
    } catch (err: any) {
      showError(tx("เกิดข้อผิดพลาด"), err?.message || tx("ไม่สามารถเชื่อมโยงได้"));
    }
  };

  const handleRemoveProcessMapping = async (mapper: ProcessMapper) => {
    const level = selectedType === "module" ? tx("โมดูล") : tx("เมนู");
    const confirmed = await showConfirm(
      tx("ยืนยันการลบการเชื่อมโยง"),
      tx("คุณต้องการนำ Process \"{0}\" ออกจาก {1} นี้ใช่หรือไม่?", mapper.display_text, level)
    );
    if (!confirmed) return;

    try {
      await deleteProcessMapperByCodes({
        module_id: selectedType === "module" ? selectedData.id : undefined,
        object_id: selectedType === "object" ? selectedData.id : undefined,
        fiscal_year: selectedFiscalYear,
        process_code: mapper.process_code,
        subprocess_code: mapper.subprocess_code,
      });
      showSuccess(tx("นำออกสำเร็จ"));
      if (selectedType && selectedData.id && (selectedType === "module" || selectedType === "object")) {
        loadProcessMappers(selectedType, selectedData.id);
      }
      if (user?.userId) {
        try {
          await invalidateUserMenuCache(user.userId);
        } catch (cacheErr) {
          console.error("Failed to invalidate cache:", cacheErr);
        }
      }
    } catch (err: any) {
      showError(tx("เกิดข้อผิดพลาด"), err?.message || tx("ไม่สามารถนำออกได้"));
    }
  };

  const filterTree = (items: TreeItem[], search: string): TreeItem[] => {
    if (!search) return items;
    return items.reduce<TreeItem[]>((acc, item) => {
      const match =
        item.label.toLowerCase().includes(search.toLowerCase()) ||
        item.code?.toLowerCase().includes(search.toLowerCase());
      const filteredChildren = item.children ? filterTree(item.children, search) : [];
      if (match || filteredChildren.length > 0) {
        acc.push({ ...item, children: filteredChildren });
      }
      return acc;
    }, []);
  };

  const filteredTreeData = filterTree(treeData, searchValue);
  const allApps = filteredTreeData.flatMap((d) => (d.children || []).map((a) => ({ a, d })));
  const selectedPair = allApps.find((x) => x.a.id === selectedAppId) || null;
  const selectedApp = selectedPair?.a || null;
  const selectedAppDomain = selectedPair?.d || null;
  // เปิดหน้ามาเลือกระบบงานแรกให้เลย (แบบหน้าบทบาทที่มีรายการเลือกไว้)
  useEffect(() => {
    if (!selectedAppId && treeData.length) {
      const first = treeData.flatMap((d) => d.children || [])[0];
      if (first) setSelectedAppId(first.id);
    }
  }, [treeData, selectedAppId]);

  const renderTreeItem = (item: TreeItem, depth = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(item.id);
    const isSelected = selectedId === item.id;
    const canHaveChildren = (item.type === "module" || item.type === "application") && !item.loaded;
    const hasChildren = (item.children && item.children.length > 0) || canHaveChildren;

    if (item.type === "object" || item.type === "application" || item.type === "module") {
      return (
        <SortableTreeItem
          key={item.id}
          item={item}
          depth={depth}
          isExpanded={isExpanded}
          isSelected={isSelected}
          hasChildren={!!hasChildren}
          onToggleExpand={(e) => handleToggleExpand(e, item)}
          onSelect={() => handleSelect(item)}
          onAdd={(e) => {
            e.stopPropagation();
            const childType: TreeItemType =
              item.type === "application" ? "module" : item.type === "module" ? "object" : "object";
            openAddFromNode(childType, item.data);
          }}
          onEdit={(e) => {
            e.stopPropagation();
            openEditDrawer(item.type, item.data);
          }}
          onDelete={(e) => {
            e.stopPropagation();
            handleDelete(item.type, item.data);
          }}
          onToggleActive={(e) => {
            e.stopPropagation();
            handleToggleActive(item.type, item.data);
          }}
          renderChildren={() =>
            hasChildren && isExpanded ? (
              <SortableContext items={item.children?.map((c) => c.id) || []} strategy={verticalListSortingStrategy}>
                {item.children!.map((child) => renderTreeItem(child, depth + 1))}
              </SortableContext>
            ) : null
          }
        />
      );
    }

    return (
      <div key={item.id} className="min-w-0">
        <div
          onClick={() => handleSelect(item)}
          className={
            "group/row flex items-center cursor-pointer relative transition-colors border-b border-[var(--iamx-border)] " +
            (isSelected ? "bg-[var(--iamx-bg-active)] shadow-[inset_3px_0_0_#0f62fe]" : "hover:bg-[var(--iamx-bg-hover)]")
          }
          style={{ minHeight: "var(--iamx-row-h)" }}
        >
          {isSelected && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--iamx-accent)]" />}
          <TreeIndent depth={depth} />
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => handleToggleExpand(e, item)}
                className="w-4 h-4 inline-flex items-center justify-center text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)] flex-shrink-0"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-4 flex-shrink-0" />
            )}
            <span
              title={item.label}
              className="text-[13px] text-[var(--iamx-fg)] truncate flex-1 min-w-0 font-semibold"
            >
              {item.label}
            </span>
            {item.code && (
              <span className="font-mono text-[11px] text-[var(--iamx-fg-muted)] hidden md:inline shrink-0">
                {item.code}
              </span>
            )}
                      </div>
        </div>
        {hasChildren && isExpanded && (
          <SortableContext items={item.children?.map((c) => c.id) || []} strategy={verticalListSortingStrategy}>
            {item.children!.map((child) => renderTreeItem(child, depth + 1))}
          </SortableContext>
        )}
      </div>
    );
  };

  // ---- DnD ----
  const findItemById = (items: TreeItem[], id: string): TreeItem | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findItemById(item.children, id);
        if (found) return found;
      }
    }
    return null;
  };
  const findParentOfItem = (items: TreeItem[], childId: string): TreeItem | null => {
    for (const item of items) {
      if (item.children?.some((child) => child.id === childId)) return item;
      if (item.children) {
        const found = findParentOfItem(item.children, childId);
        if (found) return found;
      }
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const item = findItemById(treeData, active.id as string);
    setDraggedItem(item);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedItem(null);
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeItem = findItemById(treeData, activeId);
    const overItem = findItemById(treeData, overId);
    if (!activeItem || !overItem) return;
    if (activeItem.type !== overItem.type) return;
    if (!["object", "application", "module"].includes(activeItem.type)) return;

    const activeParent = findParentOfItem(treeData, activeId);
    const overParent = findParentOfItem(treeData, overId);
    if ((activeParent?.id ?? "__root__") !== (overParent?.id ?? "__root__")) {
      showError(tx("ไม่สามารถย้ายไปยังระดับอื่นได้"), tx("การจัดเรียงทำได้เฉพาะในระดับเดียวกันเท่านั้น"));
      return;
    }

    const activeSiblings = activeParent ? (activeParent.children || []) : treeData;
    const oldIndex = activeSiblings.findIndex((item) => item.id === activeId);
    const newIndex = activeSiblings.findIndex((item) => item.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const newSiblings = arrayMove(activeSiblings, oldIndex, newIndex);

    const updateTreeWithNewOrder = (items: TreeItem[]): TreeItem[] =>
      items.map((item) => {
        if (activeItem.type === "application" && item.type === "domain" && item.children) {
          if (item.children.some((child) => child.id === activeId)) return { ...item, children: newSiblings };
        }
        if (activeItem.type === "module" && item.type === "application" && item.children) {
          if (item.children.some((child) => child.id === activeId)) return { ...item, children: newSiblings };
        }
        if (activeItem.type === "object" && item.children && item.children.some((child) => child.id === activeId)) {
          return { ...item, children: newSiblings };
        }
        if (item.children) return { ...item, children: updateTreeWithNewOrder(item.children) };
        return item;
      });

    setTreeData(updateTreeWithNewOrder(treeData));

    try {
      if (activeItem.type === "object") {
        const updates = newSiblings.map((item, index) => ({
          id: item.data.id || item.data.objectId,
          sort_order: index,
          parent_id: item.data.parent_id || null,
          object_level: item.data.object_level || 1,
        }));
        await batchUpdateObjectOrder(updates);
      } else if (activeItem.type === "application") {
        const updates = newSiblings.map((item, index) => ({ id: item.data.id, sort_order: index }));
        await batchUpdateApplicationOrder(updates);
      } else if (activeItem.type === "module") {
        const updates = newSiblings.map((item, index) => ({ id: item.data.id, sort_order: index }));
        await batchUpdateModuleOrder(updates);
      }
      showSuccess(tx("จัดเรียงสำเร็จ"));
    } catch (err: any) {
      showError(tx("เกิดข้อผิดพลาด"), err?.message || tx("ไม่สามารถบันทึกการจัดเรียงได้"));
      loadTreeData();
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-full flex flex-col">
        <PageHeader
          title={tx("โครงสร้างเมนู")}
          actions={
            <>
              {/* 13/11/69: แท็บโดเมนเดิมย้ายมาเป็นลิ้นชักจากหน้านี้ */}
              <Button variant="secondary" icon="globe" onClick={() => setDomainsOpen(true)}>
                
                {tx("โดเมน")}
              </Button>
              <Button variant="primary" icon="plus" onClick={openAddManual}>
                
                {tx("เพิ่มรายการ")}
              </Button>
            </>
          }
        />

        <div className="flex flex-col min-[900px]:flex-row flex-1 min-h-0 overflow-y-auto min-[900px]:overflow-visible">
          <div className="w-full min-[900px]:w-[340px] shrink-0 max-h-[50vh] min-[900px]:max-h-none border-b min-[900px]:border-b-0 min-[900px]:border-r border-[var(--iamx-border)] flex flex-col bg-[var(--iamx-bg)]">
            <div className="p-3 border-b border-[var(--iamx-border)]">
              <Input value={searchValue} onChange={setSearchValue} placeholder={tx("ค้นหาชื่อหรือรหัส")} icon="search" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2 px-4 h-8 items-center border-b border-[var(--iamx-border)] text-[11.5px] font-medium text-[var(--iamx-fg-muted)]">
              <span>{tx("ระบบงาน")}</span><span className="text-right">{tx("โมดูล")}</span>
            </div>
            {loading ? (
              <div className="py-8 text-center text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</div>
            ) : filteredTreeData.length === 0 ? (
              <EmptyState icon="search" title={searchValue ? tx("ไม่พบ \"{0}\"", searchValue) : tx("ยังไม่มีระบบงาน")} />
            ) : (
              <div className="overflow-y-auto flex-1">
                {filteredTreeData.map((dom) => {
                  const apps = dom.children || [];
                  const open = !!searchValue.trim() || openDomains.has(dom.id) || apps.some((a) => a.id === selectedAppId);
                  return (
                    <div key={dom.id}>
                      <button
                        type="button"
                        onClick={() => setOpenDomains((prev) => { const n = new Set(prev); n.has(dom.id) ? n.delete(dom.id) : n.add(dom.id); return n; })}
                        className="sticky top-0 z-[1] w-full flex items-center gap-2 px-4 h-9 text-[12.5px] font-medium text-[var(--iamx-fg)] bg-[var(--iamx-surface)] border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)]"
                      >
                        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        <span className={"flex-1 text-left truncate " + (dom.data?._off ? "text-[var(--iamx-fg-muted)]" : "")}>{dom.label}</span>
                        {dom.data?._off && <span className="shrink-0 text-[11px] px-2 rounded-full bg-amber-100 text-amber-700">{tx("ปิดใช้งาน")}</span>}
                        <span className="tabular-nums">{apps.length}</span>
                      </button>
                      {open && apps.length === 0 && (
                        <div className="pl-8 pr-4 py-1.5 text-[12.5px] text-[var(--iamx-fg-muted)]">{tx("ยังไม่มีระบบงาน")}</div>
                      )}
                      {open && apps.map((app) => {
                        const active = selectedAppId === app.id;
                        const off = app.data?._off || app.data?._offParent;
                        return (
                          <button
                            key={app.id}
                            type="button"
                            onClick={() => setSelectedAppId(app.id)}
                            className={"w-full text-left grid grid-cols-[minmax(0,1fr)_36px] items-baseline gap-2 pl-8 pr-4 py-1.5 text-[13px] " + (active ? "bg-[var(--iamx-bg-active)] shadow-[inset_3px_0_0_#0f62fe] font-medium" : "hover:bg-[var(--iamx-bg-hover)]")}
                          >
                            <span className={"min-w-0 break-words " + (off ? "text-[var(--iamx-fg-muted)]" : "text-[var(--iamx-fg)]")}>
                              {app.label}
                              {app.code && app.code !== app.label && <span className="ml-1.5 font-mono text-[11px] font-normal text-[var(--iamx-fg-muted)] whitespace-nowrap">{app.code}</span>}
                            </span>
                            <span className="text-right tabular-nums text-[12px] text-[var(--iamx-fg-muted)]">{(app.children || []).length}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-4 py-2 border-t border-[var(--iamx-border)] text-[11.5px] text-[var(--iamx-fg-muted)] tabular-nums">
              {tx("{0} โดเมน", filteredTreeData.filter((d) => !d.data?._off).length)}
              {filteredTreeData.some((d) => d.data?._off) && tx("· ปิดใช้งาน {0}", filteredTreeData.filter((d) => d.data?._off).length)}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0 min-h-[70vh] min-[900px]:min-h-0">
            {!selectedApp ? (
              <div className="flex items-center justify-center h-full"><EmptyState icon="layers" title={tx("เลือกระบบงาน")} /></div>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-[var(--iamx-border)] bg-[var(--iamx-bg)]">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-[18px] font-semibold text-[var(--iamx-fg)]">{selectedApp.label}</h2>
                        <span className="font-mono text-[11.5px] px-1.5 bg-[var(--iamx-surface)] text-[var(--iamx-fg-muted)]">{selectedApp.code}</span>
                        {(selectedApp.data?._off || selectedApp.data?._offParent) && <span className="text-[11px] px-2 rounded-full bg-amber-100 text-amber-700">{selectedApp.data?._offParent ? tx("ปิดตามระดับบน") : tx("ปิดใช้งาน")}</span>}
                      </div>
                      <div className="mt-1 text-[12.5px] text-[var(--iamx-fg-muted)]">
                        {selectedAppDomain?.label} · {tx("{0} โมดูล", (selectedApp.children || []).length)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span title={selectedApp.data?._offParent ? tx("ปิดตามระดับบน — เปิดที่ระดับบนก่อน") : undefined} style={selectedApp.data?._offParent ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
                        <Toggle checked={!selectedApp.data?._off && !selectedApp.data?._offParent} onChange={() => handleToggleActive("application", selectedApp.data)} />
                      </span>
                      <Button variant="secondary" size="sm" icon="edit" onClick={() => openEditDrawer("application", selectedApp.data)}>{tx("แก้ไข")}</Button>
                      <Button variant="secondary" size="sm" icon="plus" onClick={() => openAddFromNode("module", selectedApp.data)}>{tx("เพิ่มโมดูล")}</Button>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto bg-layer">
                  {(selectedApp.children || []).length === 0 ? (
                    <EmptyState icon="layers" title={tx("ยังไม่มีเมนู")} />
                  ) : (
                    <SortableContext items={(selectedApp.children || []).map((c) => c.id)} strategy={verticalListSortingStrategy}>
                      {(selectedApp.children || []).map((m) => renderTreeItem(m, 0))}
                    </SortableContext>
                  )}
                </div>
              </>
            )}
            <DragOverlay>
              {draggedItem ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-layer border border-[var(--iamx-accent)]/30 shadow opacity-90">
                  <GripVertical className="w-4 h-4 text-[var(--iamx-fg-muted)]" />
                  <span className="text-sm font-medium">{draggedItem.label}</span>
                </div>
              ) : null}
            </DragOverlay>
          </div>
        </div>

        <Drawer
          open={inspectorOpen && !!selectedData && !!selectedType && selectedType !== "application" && selectedType !== "domain"}
          onClose={() => setInspectorOpen(false)}
          title={selectedData?.name || ""}
          width={440}
          persistKey="iamx-structure-item"
        >
          {selectedData && selectedType && (
            <Inspector
              type={selectedType}
              data={selectedData}
              onEdit={() => openEditDrawer(selectedType, selectedData)}
              onDelete={() => { setInspectorOpen(false); handleDelete(selectedType, selectedData); }}
              onToggleActive={() => handleToggleActive(selectedType, selectedData)}
              onAdd={selectedType === "module" ? () => openAddFromNode("object", selectedData) : undefined}
              onOpenProcessMapping={openProcessMappingModal}
              processMappers={processMappers}
              loadingProcesses={loadingProcesses}
              selectedFiscalYear={selectedFiscalYear}
              fiscalYearOptions={fiscalYearOptions}
              onFiscalYearChange={(year) => {
                setSelectedFiscalYear(year);
                if (selectedData?.id && (selectedType === "module" || selectedType === "object")) {
                  loadProcessMappers(selectedType, selectedData.id, year);
                }
              }}
              onRemoveMapper={handleRemoveProcessMapping}
            />
          )}
        </Drawer>

        {/* Add drawer */}
        <Drawer
          open={addOpen}
          onClose={() => setAddOpen(false)}
          title={tx("เพิ่มรายการ")}

          width={640}
          persistKey="iamx-drawer-app-add"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>
                
                {tx("ยกเลิก")}
              </Button>
              <Button variant="primary" size="sm" icon="check" onClick={handleSaveNew}>
                
                {tx("สร้าง")}
              </Button>
            </>
          }
        >
          <DrawerSection title={tx("ประเภท")}>
            <div className="grid grid-cols-3 gap-2">
              {(["application", "module", "object"] as const).map((t) => {
                const meta = TYPE_META[t];
                const TypeIcon = meta.icon;
                const active = addForm.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => !addFromContext && handleAddTypeChange(t)}
                    className={
                      "px-3 py-2.5 rounded-md border text-left transition-colors " +
                      (active
                        ? "border-[var(--iamx-accent)] bg-[var(--iamx-bg-active)]"
                        : addFromContext
                          ? "border-[var(--iamx-border)] opacity-40 cursor-not-allowed"
                          : "border-[var(--iamx-border)] hover:border-[var(--iamx-border-strong)]")
                    }
                  >
                    <div className="flex items-center gap-2">
                      <TypeIcon className={`w-4 h-4 ${meta.color}`} />
                      <span className="text-[13px] font-medium">{meta.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </DrawerSection>

          <DrawerSection title={tx("อยู่ใต้")}>
            <div className="grid grid-cols-1 gap-3">
              <FormField label={tx("โดเมน")} required={addForm.type === "application"}>
                <Select
                  value={addForm.domain_id}
                  onChange={(v) =>
                    setAddForm((p) => ({ ...p, domain_id: v, application_id: "", module_id: "", parent_object_id: "" }))
                  }
                  options={domainOptions}
                  placeholder={tx("เลือกโดเมน...")}
                  disabled={addFromContext}
                />
              </FormField>
              {(addForm.type === "module" || addForm.type === "object") && (
                <FormField label={tx("ระบบงาน")} required>
                  <Select clearable={false}
                    value={addForm.application_id}
                    onChange={(v) =>
                      setAddForm((p) => ({ ...p, application_id: v, module_id: "", parent_object_id: "" }))
                    }
                    options={appOptionsFor(addForm.domain_id)}
                    placeholder={addForm.domain_id ? tx("เลือกระบบงาน...") : tx("เลือกโดเมนก่อน")}
                    disabled={addFromContext || !addForm.domain_id}
                  />
                </FormField>
              )}
              {addForm.type === "object" && (
                <>
                  <FormField label={tx("โมดูล")} required>
                    <Select clearable={false}
                      value={addForm.module_id}
                      onChange={(v) => setAddForm((p) => ({ ...p, module_id: v, parent_object_id: "" }))}
                      options={moduleOptionsFor(addForm.domain_id, addForm.application_id)}
                      placeholder={addForm.application_id ? tx("เลือกโมดูล...") : tx("เลือกระบบงานก่อน")}
                      disabled={addFromContext || !addForm.application_id}
                    />
                  </FormField>
                  <FormField label={tx("เมนูแม่ (ไม่บังคับ)")}>
                    <Select
                      value={addForm.parent_object_id}
                      onChange={(v) => setAddForm((p) => ({ ...p, parent_object_id: v }))}
                      options={objectOptionsFor(addForm.domain_id, addForm.application_id, addForm.module_id)}
                      placeholder={addForm.module_id ? tx("ไม่มี (ระดับบนสุด)") : tx("เลือกโมดูลก่อน")}
                      disabled={!addForm.module_id}
                    />
                  </FormField>
                </>
              )}
            </div>
          </DrawerSection>

          <DrawerSection title={tx("ข้อมูลพื้นฐาน")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
              <FormField label={tx("รหัส")} required>
                <Input
                  value={addForm.code}
                  onChange={(v) => setAddForm((p) => ({ ...p, code: v }))}
                  placeholder={addForm.type === "application" ? tx("เช่น APP001") : addForm.type === "module" ? tx("เช่น MOD001") : "auto"}
                  disabled={addForm.type === "object"}
                  autoFocus={addForm.type !== "object"}
                  maxLength={addForm.type === "object" ? 100 : 50}
                />
              </FormField>
              <FormField label={tx("ชื่อ")} required>
                <Input
                  value={addForm.name}
                  onChange={(v) => setAddForm((p) => ({ ...p, name: v }))}
                  placeholder={addForm.type === "application" ? tx("เช่น ระบบบัญชี") : addForm.type === "module" ? tx("เช่น BPN07") : tx("เช่น ปฏิทินงบประมาณ")}
                  maxLength={200}
                  autoFocus={addForm.type === "object"}
                />
              </FormField>
            </div>
            <FormField label={tx("คำอธิบาย")} className="mt-3">
              <Textarea
                value={addForm.description}
                onChange={(v) => setAddForm((p) => ({ ...p, description: v }))}
                rows={2}
                maxLength={500}
                placeholder={tx("คำอธิบาย (ไม่บังคับ)")}
              />
            </FormField>
          </DrawerSection>

          {addForm.type === "object" && (
            <DrawerSection title={tx("คุณสมบัติของเมนู")}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
                <FormField label={tx("ประเภทเมนู")} required>
                  <Select clearable={false}
                    value={addForm.object_type_id}
                    onChange={(v) => setAddForm((p) => ({ ...p, object_type_id: v }))}
                    options={objectTypes}
                    placeholder={tx("เลือกประเภทเมนู")}
                  />
                </FormField>
                <FormField label={tx("ที่อยู่หน้าจอ (path)")}>
                  <Input
                    value={addForm.path}
                    onChange={(v) => setAddForm((p) => ({ ...p, path: v }))}
                    placeholder="/domain/app/module/object"
                  />
                </FormField>
              </div>
              <div className="mt-3">
                <Toggle
                  checked={!!addForm.is_shortcut}
                  onChange={(v) => setAddForm((p) => ({ ...p, is_shortcut: v ? 1 : 0 }))}
                  label={tx("ทางลัด")}
                />
              </div>
            </DrawerSection>
          )}

          <DrawerSection title={tx("ไอคอน (SVG)")}>
            <Textarea
              value={addForm.icon}
              onChange={(v) => setAddForm((p) => ({ ...p, icon: v }))}
              rows={4}
              placeholder='<svg viewBox="0 0 24 24">...</svg>'
              className="font-mono text-[11.5px]"
            />
          </DrawerSection>
        </Drawer>

        {/* Edit drawer */}
        <Drawer
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title={editType ? tx("แก้ไข {0}: {1}", TYPE_META[editType].label, editForm.name) : tx("แก้ไข")}
          subtitle={editForm.code ? tx("รหัส {0}", editForm.code) : ""}
          width={640}
          persistKey="iamx-drawer-app-edit"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(false)}>
                
                {tx("ยกเลิก")}
              </Button>
              <Button variant="primary" size="sm" icon="check" onClick={handleSaveEdit}>
                
                {tx("บันทึก")}
              </Button>
            </>
          }
        >
          <DrawerSection title={tx("ข้อมูลพื้นฐาน")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
              <FormField label={tx("รหัส")} required>
                <Input
                  value={editForm.code}
                  onChange={(v) => setEditForm((p) => ({ ...p, code: v }))}
                  disabled={editType === "object"}
                  maxLength={editType === "object" ? 100 : 50}
                />
              </FormField>
              <FormField label={tx("ชื่อ")} required>
                <Input
                  value={editForm.name}
                  onChange={(v) => setEditForm((p) => ({ ...p, name: v }))}
                  maxLength={200}
                />
              </FormField>
            </div>
            <FormField label={tx("คำอธิบาย")} className="mt-3">
              <Textarea
                value={editForm.description}
                onChange={(v) => setEditForm((p) => ({ ...p, description: v }))}
                rows={2}
              />
            </FormField>
          </DrawerSection>

          {editType === "object" && (
            <DrawerSection title={tx("คุณสมบัติของเมนู")}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
                <FormField label={tx("ประเภทเมนู")} required>
                  <Select clearable={false}
                    value={editForm.object_type_id}
                    onChange={(v) => setEditForm((p) => ({ ...p, object_type_id: v }))}
                    options={objectTypes}
                    placeholder={tx("เลือกประเภทเมนู")}
                  />
                </FormField>
                <FormField label={tx("ที่อยู่หน้าจอ (path)")}>
                  <Input
                    value={editForm.path}
                    onChange={(v) => setEditForm((p) => ({ ...p, path: v }))}
                    placeholder="/path"
                  />
                </FormField>
              </div>
              <div className="mt-3">
                <Toggle
                  checked={!!editForm.is_shortcut}
                  onChange={(v) => setEditForm((p) => ({ ...p, is_shortcut: v ? 1 : 0 }))}
                  label={tx("ทางลัด")}
                />
              </div>
            </DrawerSection>
          )}

          <DrawerSection title={tx("ไอคอน (SVG)")}>
            <Textarea
              value={editForm.icon}
              onChange={(v) => setEditForm((p) => ({ ...p, icon: v }))}
              rows={4}
              placeholder='<svg viewBox="0 0 24 24">...</svg>'
              className="font-mono text-[11.5px]"
            />
          </DrawerSection>
        </Drawer>

        {/* Process mapping modal */}
        {showProcessMappingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div
              className="w-full max-w-2xl rounded-lg bg-[var(--iamx-bg)] shadow-2xl max-h-[85vh] flex flex-col border border-[var(--iamx-border)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center px-5 h-12 border-b border-[var(--iamx-border)] shrink-0">
                <h2 className="text-[14px] font-semibold text-[var(--iamx-fg)] flex-1">
                  
                  {tx("เชื่อมโยง Process กับ")}{" "}{selectedType === "module" ? tx("โมดูล") : tx("เมนู")}
                </h2>
                <IconButton
                  icon="x"
                  label={tx("ปิด")}
                  onClick={() => {
                    setShowProcessMappingModal(false);
                    setProcessPaths(new Map());
                    setRoleAssignments(new Map());
                    setProcessSearchQuery("");
                  }}
                />
              </div>

              <div className="px-5 py-3 border-b border-[var(--iamx-border)] shrink-0 flex gap-3 items-end">
                <div className="shrink-0">
                  <FormField label={tx("ปีงบประมาณ")}>
                    <Select
                      value={String(selectedFiscalYear)}
                      onChange={(v) => {
                        const year = parseInt(v);
                        setSelectedFiscalYear(year);
                        fetchOracleProcesses(year.toString())
                          .then(setOracleProcesses)
                          .catch((err) => {
                            console.error("Failed to fetch Oracle processes:", err);
                            showError(tx("เกิดข้อผิดพลาด"), tx("ไม่สามารถโหลดรายการ Process ได้"));
                          });
                      }}
                      options={fiscalYearOptions.map((y) => ({ value: String(y), label: tx("ปี {0}", y) }))}
                    />
                  </FormField>
                </div>
                <div className="flex-1">
                  <FormField label={tx("ค้นหา")}>
                    <Input
                      value={processSearchQuery}
                      onChange={setProcessSearchQuery}
                      placeholder={tx("ค้นหาขั้นดำเนินการ...")}
                    />
                  </FormField>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {(() => {
                  const q = processSearchQuery.trim().toLowerCase();
                  const filtered = q
                    ? oracleProcesses.filter(
                        (p) =>
                          p.display_text.toLowerCase().includes(q) ||
                          p.process_code.toLowerCase().includes(q) ||
                          p.subprocess_code.toLowerCase().includes(q)
                      )
                    : oracleProcesses;
                  return filtered.length === 0 ? (
                  <EmptyState
                    icon="settings"
                    title={tx("ไม่พบขั้นดำเนินการ")}
                    hint={q ? tx("ไม่พบผลลัพธ์สำหรับ \"{0}\"", processSearchQuery) : tx("สำหรับปีงบประมาณ {0}", selectedFiscalYear)}
                  />
                ) : (
                  filtered.map((proc, index) => {
                    const key = `${proc.process_code}|${proc.subprocess_code}`;
                    const isSelected = selectedProcesses.has(key);
                    const customPath = processPaths.get(key) ?? "";
                    return (
                      <div
                        key={index}
                        className={
                          "px-5 py-3 border-b border-[var(--iamx-border)] " +
                          (isSelected ? "bg-[var(--iamx-bg-active)]" : "hover:bg-[var(--iamx-bg-hover)]")
                        }
                      >
                        <label className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            
                            checked={isSelected}
                            onChange={() => toggleProcessSelection(proc.process_code, proc.subprocess_code)}
                            className="w-4 h-4 rounded border-[var(--iamx-border-strong)]"
                            style={{ accentColor: "var(--iamx-accent)" }}
                          />
                          <div className="w-7 h-7 rounded bg-[var(--iamx-bg-hover)] flex items-center justify-center shrink-0">
                            <SettingsIcon className="w-3.5 h-3.5 text-[var(--iamx-fg-muted)]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[13px] truncate">{proc.display_text}</p>
                            <p className="text-[11.5px] text-[var(--iamx-fg-muted)] font-mono">
                              {proc.process_code} / {proc.subprocess_code}
                            </p>
                          </div>
                        </label>
                        {isSelected && (
                          <div className="mt-2 ml-11 space-y-2">
                            <FormField label={tx("ที่อยู่ URL")}>
                              <Input
                                value={customPath}
                                onChange={(v) => updateProcessPath(key, v)}
                                placeholder={tx("เช่น /path/to/component")}
                              />
                            </FormField>
                            <FormField label={tx("จำกัดเฉพาะบทบาท (ว่าง = ทุกบทบาทเห็น)")}>
                              <MultiSelect
                                options={roles.map((r) => ({ value: r.id, label: r.name }))}
                                value={roleAssignments.get(key) ?? []}
                                onChange={(v) => updateProcessRoles(key, v)}
                                placeholder={tx("ทุกบทบาทเห็น")}
                              />
                            </FormField>
                          </div>
                        )}
                      </div>
                    );
                  })
                );
                })()}
              </div>

              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--iamx-border)] shrink-0 bg-[var(--iamx-surface)]">
                <span className="text-[12px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("เลือก")}{" "}{selectedProcesses.size} {" "}{tx("รายการ")}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowProcessMappingModal(false);
                      setProcessPaths(new Map());
                      setRoleAssignments(new Map());
                      setProcessSearchQuery("");
                    }}
                  >
                    
                    {tx("ยกเลิก")}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon="check"
                    disabled={selectedProcesses.size === 0}
                    onClick={handleAddProcessMapping}
                  >
                    
                    {tx("เชื่อมโยง (")}{selectedProcesses.size})
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        <Drawer open={domainsOpen} onClose={() => { setDomainsOpen(false); loadTreeData(); }} title={tx("โดเมน")} width={900} persistKey="iamx-drawer-domains">
          {domainsOpen && <div className="iamx-embedded h-full"><DomainsPage /></div>}
        </Drawer>
      </div>
    </DndContext>
  );
}

// ---- Inspector ----------------------------------------------------------
function Inspector({
  type, data, onEdit, onDelete: _onDelete, onToggleActive, onOpenProcessMapping,
  processMappers, loadingProcesses, selectedFiscalYear, fiscalYearOptions,
  onFiscalYearChange, onRemoveMapper, onAdd,
}: {
  onAdd?: () => void;
  type: TreeItemType;
  data: any;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onOpenProcessMapping: () => void;
  processMappers: ProcessMapper[];
  loadingProcesses: boolean;
  selectedFiscalYear: number;
  fiscalYearOptions: number[];
  onFiscalYearChange: (year: number) => void;
  onRemoveMapper: (m: ProcessMapper) => void;
}) {
  const meta = TYPE_META[type];
  const TypeIcon = meta.icon;

  return (
    <div className="p-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--iamx-fg-muted)] mb-3">
        {type === "application" && data.domain_name && (
          <>
            <Globe className="w-3 h-3" />
            <span>{data.domain_name}</span>
            <ChevronRight className="w-3 h-3 opacity-60" />
          </>
        )}
        {type === "module" && (
          <>
            {data.domain_name && (
              <>
                <Globe className="w-3 h-3" />
                <span>{data.domain_name}</span>
                <ChevronRight className="w-3 h-3 opacity-60" />
              </>
            )}
            {data.application_name && (
              <>
                <LayoutGrid className="w-3 h-3" />
                <span>{data.application_name}</span>
                <ChevronRight className="w-3 h-3 opacity-60" />
              </>
            )}
          </>
        )}
        {type === "object" && data.moduleName && (
          <>
            <Folder className="w-3 h-3" />
            <span>{data.moduleName}</span>
            <ChevronRight className="w-3 h-3 opacity-60" />
          </>
        )}
        <span className="text-[var(--iamx-accent)] font-medium">{meta.label}</span>
      </div>

      <div className="flex items-start gap-3 mb-4">
        <span className={`h-10 w-10 bg-[var(--iamx-surface)] flex items-center justify-center shrink-0`}>
          {data.icon ? (
            <SafeIcon svg={data.icon} className="w-5 h-5" />
          ) : (
            <TypeIcon className={`w-5 h-5 ${meta.color}`} />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-[var(--iamx-fg)] break-words">{data.name}</div>
          <div className="font-mono text-[11.5px] text-[var(--iamx-fg-muted)] truncate">{data.code}</div>
        </div>
      </div>


      <div className="flex flex-wrap gap-1.5 mb-5">
        {onAdd && (
          <Button variant="secondary" size="sm" icon="plus" onClick={onAdd}>
            {type === "domain" ? tx("เพิ่มระบบงาน") : type === "application" ? tx("เพิ่มโมดูล") : tx("เพิ่มเมนู")}
          </Button>
        )}
        {type !== "domain" && (
          <Button variant="secondary" size="sm" icon="edit" onClick={onEdit}>
            
            {tx("แก้ไข")}
          </Button>
        )}
        {/* 13/11/69: ปุ่มเปิด/ปิดซ้ำกับสวิตช์ "สถานะการใช้งาน" ด้านล่าง → เอาออก · ถังขยะมาอยู่แถวเดียวกัน */}
      </div>

      <div className="-mx-5 border-t border-[var(--iamx-border)] divide-y divide-[var(--iamx-border)]">
        <Section title={tx("สถานะการใช้งาน")}>
          <div style={data._offParent ? { opacity: 0.6, pointerEvents: "none" } : undefined}>
            <Toggle checked={!data._off && !data._offParent} onChange={() => onToggleActive()}
              label={data._offParent ? tx("ปิดตามระดับบน") : data._off ? tx("ปิดใช้งาน") : tx("ใช้งาน")} />
          </div>
        </Section>
        <Section title={tx("ข้อมูลทั่วไป")}>
          <Row label={tx("คำอธิบาย")} value={data.description || "-"} />
          {type === "object" && (
            <Row label={tx("ที่อยู่หน้าจอ (path)")} value={<span className="font-mono text-[11.5px]">{data.path || "-"}</span>} />
          )}
        </Section>

        {type === "object" && data?.id && <MenuAccessSection objectId={String(data.id)} />}

        {(type === "module" || type === "object") && (
          <Section title={tx("เชื่อมโยงขั้นดำเนินการ")}>
            <div className="flex items-center gap-2 mb-3">
              <Select
                value={String(selectedFiscalYear)}
                onChange={(v) => onFiscalYearChange(parseInt(v))}
                options={fiscalYearOptions.map((y) => ({ value: String(y), label: tx("ปี {0}", y) }))}
                className="max-w-[140px]"
              />
              <Button variant="secondary" size="xs" icon="plus" onClick={onOpenProcessMapping}>
                
                {tx("เพิ่ม")}
              </Button>
            </div>
            {loadingProcesses ? (
              <div className="flex items-center justify-center py-4">
                <span className="text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</span>
              </div>
            ) : processMappers.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-[var(--iamx-fg-muted)] bg-layer rounded-md border border-dashed border-[var(--iamx-border)]">
                
                {tx("ไม่มีขั้นดำเนินการที่เชื่อมโยง")}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {processMappers.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 p-2 rounded-md bg-layer border border-[var(--iamx-border)]"
                  >
                    <span className="w-7 h-7 rounded bg-[var(--iamx-bg-hover)] flex items-center justify-center shrink-0">
                      <SettingsIcon className="w-3.5 h-3.5 text-[var(--iamx-fg-muted)]" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate flex items-center gap-1.5">
                        <span className="truncate">{m.display_text}</span>
                        {!!m.allowed_role_ids?.length && (
                          <span
                            className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[var(--iamx-accent-soft)] text-[var(--iamx-accent)]"
                            title={tx("มองเห็นได้เฉพาะ {0} บทบาท", m.allowed_role_ids.length)}
                          >
                            <Shield className="w-2.5 h-2.5" />
                            {m.allowed_role_ids.length}
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-[var(--iamx-fg-muted)] font-mono truncate">
                        {m.process_code} / {m.subprocess_code}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveMapper(m)}
                      className="p-1 rounded text-[var(--iamx-fg-muted)] hover:text-red-600 hover:bg-red-50"
                      title={tx("นำออก")}
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title={tx("ข้อมูลเชื่อมโยง")}>
          {data.domain_name && (
            <LinkedRow icon={Globe} label={tx("โดเมน")} value={data.domain_name} />
          )}
          {(type === "module" || type === "object") && data.application_name && (
            <LinkedRow icon={LayoutGrid} label={tx("ระบบงาน")} value={data.application_name} />
          )}
          {type === "object" && (data.moduleName || data.module_name) && (
            <LinkedRow icon={Folder} label={tx("โมดูล")} value={data.moduleName || data.module_name} />
          )}
        </Section>
      </div>
    </div>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <h3 className="text-[11.5px] font-semibold text-[var(--iamx-fg-muted)] mb-2">
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-[12.5px]">
      <dt className="w-24 shrink-0 text-[var(--iamx-fg-muted)]">{label}</dt>
      <dd className="flex-1 text-[var(--iamx-fg)] min-w-0">{value}</dd>
    </div>
  );
}

function LinkedRow({ icon: I, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-[12.5px]">
      <span className="w-8 h-8 rounded-md bg-[var(--iamx-bg-hover)] flex items-center justify-center shrink-0">
        <I className="w-3.5 h-3.5 text-[var(--iamx-fg-muted)]" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-[var(--iamx-fg-muted)]">{label}</div>
        <div className="text-[var(--iamx-fg)] font-medium truncate">{value}</div>
      </div>
    </div>
  );
}


// 14/11/69: ใครเข้าเมนูนี้ได้ (ค้นย้อนจากเมนู) — ได้จากบทบาท + ข้อยกเว้นที่ให้เพิ่ม − ข้อยกเว้นที่ซ่อน
function MenuAccessSection({ objectId }: { objectId: string }) {
  const [rows, setRows] = useState<{ user_id: string; user_name: string; name: string; roles: string; exception: boolean }[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    let cancel = false;
    setRows(null);
    setErr("");
    fetch(`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api/admin/menu-access/${objectId}`)
      .then((r) => r.json())
      .then((j) => { if (cancel) return; if (!j.success) throw new Error(); setRows(j.data.items || []); setHidden(j.data.hidden || 0); })
      .catch(() => !cancel && setErr("Couldn't load"));
    return () => { cancel = true; };
  }, [objectId]);
  const shown = (rows || []).filter((r) => !q || `${r.user_name} ${r.name} ${r.roles}`.toLowerCase().includes(q.toLowerCase()));
  const exportCsv = () => {
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = [["Username", "Name", "Roles", "Per-user exception"], ...(rows || []).map((r) => [r.user_name, r.name, r.roles, r.exception ? "yes" : ""])].map((r) => r.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" }));
    a.download = `menu-${objectId}-access.csv`;
    a.click();
  };
  return (
    <Section title={rows ? `Who can access · ${rows.length}` : "Who can access"}>
      {err ? <div className="text-[12.5px] text-red-600">{err}</div> : !rows ? <div className="text-[12.5px] text-[var(--iamx-fg-muted)]">Loading…</div> : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1"><Input value={q} onChange={setQ} placeholder="Search user or role" icon="search" /></div>
            {rows.length > 0 && <Button variant="ghost" size="sm" icon="download" onClick={exportCsv}>CSV</Button>}
          </div>
          {hidden > 0 && <div className="text-[12px] text-[var(--iamx-fg-muted)]">{hidden} hidden by per-user exception</div>}
          <div className="max-h-[260px] overflow-auto border-t border-[var(--iamx-border)]">
            {shown.length === 0 ? <div className="py-3 text-[12.5px] text-[var(--iamx-fg-muted)]">No users</div> : shown.map((r) => (
              <div key={r.user_id} className="py-1.5 border-b border-[var(--iamx-border)] text-[12.5px]">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[var(--iamx-fg)]">{r.name || r.user_name}</span>
                  {r.exception && <span className="shrink-0 text-[11px] px-1.5 rounded-full bg-amber-100 text-amber-700">Exception</span>}
                </div>
                <div className="text-[11.5px] text-[var(--iamx-fg-muted)] truncate">{r.user_name}{r.roles ? ` · ${r.roles}` : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
