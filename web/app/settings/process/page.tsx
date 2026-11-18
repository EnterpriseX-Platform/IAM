"use client";

import {
  Badge,
  Button,
  Drawer,
  DrawerSection,
  EmptyState,
  FormField,
  IconButton,
  Input,
  PageHeader,
  Select,
  StatusPill,
  Toolbar,
} from "@/app/components/iamx";
import { showConfirm, showError, showSuccess } from "@/lib/swal";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { Box, ChevronDown, ChevronRight, Settings as SettingsIcon } from "@/app/components/iamx/carbonLucide";
import React, { useEffect, useState } from "react";
import {
  cloneRefProcesses,
  createRefProcess,
  createRefSubprocess,
  deleteRefProcess,
  deleteRefSubprocess,
  fetchRefProcesses,
  updateRefProcess,
  updateRefSubprocess,
  type RefProcess,
  type RefSubprocess,
} from "../app/api";

type NodeType = "process" | "subprocess";

interface TreeNode {
  id: string;
  type: NodeType;
  code: string;
  name: string;
  display_code?: string;
  display_name?: string;
  module_name?: string;
  fiscal_year: string;
  status: string;
  children?: TreeNode[];
  parentId?: string;
  raw: RefProcess | RefSubprocess;
}

const getNumericParts = (code: string): number[] =>
  code.split(".").map((p) => parseInt(p, 10) || 0);

const compareCodes = (a: string, b: string): number => {
  const A = getNumericParts(a);
  const B = getNumericParts(b);
  const min = Math.min(A.length, B.length);
  for (let i = 0; i < min; i++) {
    if (A[i] !== B[i]) return A[i] - B[i];
  }
  return A.length - B.length;
};

const flattenForRender = (
  nodes: TreeNode[],
  expanded: Set<string>,
  search: string,
  depth = 0,
  out: Array<{ node: TreeNode; depth: number; hasMatchingChild: boolean }> = []
) => {
  for (const node of nodes) {
    const matches =
      !search ||
      [node.code, node.name, node.display_name, node.display_code, node.module_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase());
    const childRows = node.children ? flattenForRender(node.children, expanded, search, depth + 1) : [];
    const hasMatchingChild = childRows.length > 0;
    if (matches || hasMatchingChild) {
      out.push({ node, depth, hasMatchingChild });
      if (node.children && (search ? hasMatchingChild || matches : expanded.has(node.id))) {
        out.push(...childRows);
      }
    }
  }
  return out;
};

const collectAllIds = (nodes: TreeNode[], out = new Set<string>()) => {
  for (const n of nodes) {
    out.add(n.id);
    if (n.children) collectAllIds(n.children, out);
  }
  return out;
};

type ModalForm = {
  code: string;
  name: string;
  display_code: string;
  display_name: string;
  module_name: string;
  status: string;
};

const EMPTY_FORM: ModalForm = {
  code: "",
  name: "",
  display_code: "",
  display_name: "",
  module_name: "",
  status: "ACTIVE",
};

export default function ProcessPage() {
  const currentThaiYear = new Date().getFullYear() + 543;
  const fiscalYearOptions = Array.from({ length: 9 }, (_, i) => currentThaiYear - 3 + i);

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>(currentThaiYear.toString());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<NodeType>("process");
  const [addParent, setAddParent] = useState<RefProcess | null>(null);
  const [addForm, setAddForm] = useState<ModalForm>(EMPTY_FORM);

  const [editOpen, setEditOpen] = useState(false);
  const [editType, setEditType] = useState<NodeType>("process");
  const [editData, setEditData] = useState<TreeNode | null>(null);
  const [editForm, setEditForm] = useState<ModalForm>(EMPTY_FORM);

  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneTargetYear, setCloneTargetYear] = useState<string>("");
  const [isCloning, setIsCloning] = useState(false);

  useEscapeKey(addOpen, () => setAddOpen(false));
  useEscapeKey(editOpen, () => setEditOpen(false));
  useEscapeKey(cloneOpen, () => setCloneOpen(false));

  useEffect(() => {
    loadTree();
  }, [selectedFiscalYear]);

  const loadTree = async () => {
    setLoading(true);
    try {
      const processes = await fetchRefProcesses(selectedFiscalYear);
      processes.sort((a, b) => compareCodes(a.process_code, b.process_code));

      const items: TreeNode[] = [];
      const allExpanded = new Set<string>();

      for (const proc of processes) {
        const sortedSub = [...(proc.subprocesses || [])].sort((a, b) =>
          compareCodes(a.subprocess_code, b.subprocess_code)
        );
        const procNode: TreeNode = {
          id: proc.process_id,
          type: "process",
          code: proc.process_code,
          name: proc.process_name,
          display_code: proc.display_code,
          display_name: proc.display_name,
          module_name: proc.module_name,
          fiscal_year: proc.fiscal_year,
          status: proc.status,
          raw: proc,
          children: sortedSub.map((sub) => ({
            id: sub.subprocess_id,
            type: "subprocess" as NodeType,
            code: sub.subprocess_code,
            name: sub.subprocess_name,
            display_code: sub.display_code,
            display_name: sub.display_name,
            fiscal_year: sub.fiscal_year,
            status: sub.status,
            parentId: proc.process_id,
            raw: sub,
          })),
        };
        items.push(procNode);
        allExpanded.add(procNode.id);
      }

      setTree(items);
      setExpanded(allExpanded);
    } catch (error) {
      console.error("Failed to load tree:", error);
      showError("เกิดข้อผิดพลาด", "ไม่สามารถโหลดข้อมูล Process ได้");
    } finally {
      setLoading(false);
    }
  };

  const rows = flattenForRender(tree, expanded, search);
  const totalNodes = collectAllIds(tree).size;

  const toggleNode = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => setExpanded(collectAllIds(tree));
  const collapseAll = () => setExpanded(new Set());

  const openAddProcess = () => {
    setAddType("process");
    setAddParent(null);
    setAddForm(EMPTY_FORM);
    setAddOpen(true);
  };

  const openAddSubprocess = (parent: RefProcess) => {
    setAddType("subprocess");
    setAddParent(parent);
    setAddForm({ ...EMPTY_FORM, module_name: parent.module_name || "" });
    setAddOpen(true);
  };

  const handleSaveAdd = async () => {
    if (!addForm.code.trim() || !addForm.name.trim())
      return showError("กรุณากรอก", "รหัส และชื่อจำเป็น");
    try {
      if (addType === "process") {
        await createRefProcess({
          fiscal_year: selectedFiscalYear,
          process_code: addForm.code,
          process_name: addForm.name,
          display_code: addForm.display_code,
          display_name: addForm.display_name,
          module_name: addForm.module_name,
          status: addForm.status,
          created_by: "SYSTEM",
        });
      } else if (addParent) {
        await createRefSubprocess(addParent.process_id, {
          subprocess_code: addForm.code,
          subprocess_name: addForm.name,
          display_code: addForm.display_code,
          display_name: addForm.display_name,
          status: addForm.status,
          fiscal_year: selectedFiscalYear,
          created_by: "SYSTEM",
        });
        setExpanded((prev) => new Set([...prev, addParent.process_id]));
      }
      setAddOpen(false);
      await loadTree();
      showSuccess("สร้างสำเร็จ");
    } catch (error: any) {
      console.error(error);
      showError("ไม่สามารถสร้างได้", error?.message || "เกิดข้อผิดพลาด");
    }
  };

  const openEdit = (node: TreeNode) => {
    setEditType(node.type);
    setEditData(node);
    setEditForm({
      code: node.code,
      name: node.name,
      display_code: node.display_code || "",
      display_name: node.display_name || "",
      module_name: node.module_name || "",
      status: node.status,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editData) return;
    if (!editForm.code.trim() || !editForm.name.trim())
      return showError("กรุณากรอก", "รหัส และชื่อจำเป็น");

    try {
      if (editType === "process") {
        await updateRefProcess(editData.id, {
          process_code: editForm.code,
          process_name: editForm.name,
          display_code: editForm.display_code,
          display_name: editForm.display_name,
          module_name: editForm.module_name,
          status: editForm.status,
          updated_by: "SYSTEM",
        });
      } else {
        await updateRefSubprocess(editData.id, {
          subprocess_code: editForm.code,
          subprocess_name: editForm.name,
          display_code: editForm.display_code,
          display_name: editForm.display_name,
          status: editForm.status,
          updated_by: "SYSTEM",
        });
      }
      setEditOpen(false);
      await loadTree();
      showSuccess("บันทึกสำเร็จ");
    } catch (error: any) {
      console.error(error);
      showError("ไม่สามารถบันทึกได้", error?.message || "เกิดข้อผิดพลาด");
    }
  };

  const handleDelete = async (node: TreeNode) => {
    const confirmed = await showConfirm(
      `ยืนยันการลบ ${node.type === "process" ? "ขั้นหลัก" : "ขั้นย่อย"}`,
      `คุณต้องการลบ "${node.name}" ใช่หรือไม่?`
    );
    if (!confirmed) return;
    try {
      if (node.type === "process") await deleteRefProcess(node.id);
      else await deleteRefSubprocess(node.id);
      loadTree();
      showSuccess("ลบสำเร็จ");
    } catch (error) {
      console.error(error);
      showError("ไม่สามารถลบได้", "เนื่องจากมีข้อมูลที่เกี่ยวข้อง");
    }
  };

  const openCloneDialog = () => {
    setCloneTargetYear(selectedFiscalYear);
    setCloneOpen(true);
  };

  const handleClone = async () => {
    if (!cloneTargetYear || cloneTargetYear === selectedFiscalYear)
      return showError("ข้อมูลไม่ถูกต้อง", "กรุณาเลือกปีงบประมาณเป้าหมายที่ต่างจากปีปัจจุบัน");
    try {
      setIsCloning(true);
      await cloneRefProcesses({
        source_fiscal_year: selectedFiscalYear,
        target_fiscal_year: cloneTargetYear,
        created_by: "SYSTEM",
      });
      showSuccess("คัดลอกสำเร็จ", `จากปี ${selectedFiscalYear} ไปยังปี ${cloneTargetYear}`);
      setCloneOpen(false);
      setSelectedFiscalYear(cloneTargetYear);
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("already has data")) {
        showError("ข้อมูลซ้ำ", `ปี ${cloneTargetYear} มีข้อมูลอยู่แล้ว`);
      } else {
        showError("เกิดข้อผิดพลาด", error?.message || "ไม่สามารถคัดลอกได้");
      }
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="ขั้นดำเนินการ"
        description="ขั้นตอนการดำเนินงานตามปีงบประมาณ มีลำดับชั้นไม่จำกัด (Process → Subprocess → ...)"
        actions={
          <>
            <Button variant="secondary" icon="copy" onClick={openCloneDialog}>
              คัดลอกจากปีก่อน
            </Button>
            <Button
              variant="secondary"
              icon={expanded.size > 0 ? "contract" : "expand"}
              onClick={expanded.size > 0 ? collapseAll : expandAll}
            >
              {expanded.size > 0 ? "ยุบทั้งหมด" : "กางทั้งหมด"}
            </Button>
            <Button variant="primary" icon="plus" onClick={openAddProcess}>
              เพิ่มขั้น
            </Button>
          </>
        }
      />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาขั้นหลัก ขั้นย่อย..."
        right={
          <div className="flex items-center gap-2">
            <Select
              value={selectedFiscalYear}
              onChange={setSelectedFiscalYear}
              options={fiscalYearOptions.map((y) => ({ value: String(y), label: `ปีงบฯ ${y}` }))}
              className="w-[140px]"
            />
            <span className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">
              แสดง {rows.length} จาก {totalNodes}
            </span>
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={search ? "search" : "workflow"}
            title={search ? `ไม่พบ "${search}"` : `ไม่มีขั้นดำเนินการสำหรับปี ${selectedFiscalYear}`}
            hint={search ? "ลองคำอื่น หรือเปลี่ยน filter" : "เพิ่มขั้นหลักเพื่อเริ่มต้น หรือคัดลอกจากปีก่อน"}
          />
        ) : (
          <table className="cds--data-table cds--data-table--sm w-full text-[13px] border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--iamx-bg)]">
              <tr className="border-b border-[var(--iamx-border)]">
                <th className="text-left h-9 pl-6 pr-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  ขั้นดำเนินการ
                </th>
                <th className="w-32 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  รหัส
                </th>
                <th className="w-36 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  โมดูล
                </th>
                <th className="w-20 h-9 px-3 text-center font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  ปีงบฯ
                </th>
                <th className="w-24 h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  สถานะ
                </th>
                <th className="w-32 h-9 px-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth }) => {
                const hasChildren = node.children && node.children.length > 0;
                const isExpanded = expanded.has(node.id);
                const active = node.status === "ACTIVE";
                return (
                  <tr
                    key={node.id}
                    onClick={() => openEdit(node)}
                    className="group/row border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)] cursor-pointer"
                    style={{ height: "var(--iamx-row-h)" }}
                  >
                    <td className="pr-3 align-middle" style={{ paddingLeft: 24 + depth * 22 }}>
                      <div className="flex items-center gap-2 min-w-0 relative">
                        {depth > 0 && (
                          <span
                            aria-hidden
                            className="absolute -left-[14px] top-1/2 h-px w-3 bg-[var(--iamx-border-strong)]"
                          />
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hasChildren) toggleNode(node.id);
                          }}
                          className={
                            "h-4 w-4 inline-flex items-center justify-center rounded text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)] shrink-0 " +
                            (!hasChildren ? "invisible" : "")
                          }
                          aria-label={isExpanded ? "ยุบ" : "กาง"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <span
                          className={
                            "h-5 w-5 rounded inline-flex items-center justify-center shrink-0 " +
                            (depth === 0
                              ? "bg-[var(--iamx-bg-active)] text-[var(--iamx-fg)]"
                              : "bg-amber-50 text-amber-600")
                          }
                        >
                          {depth === 0 ? (
                            <SettingsIcon className="w-3 h-3" />
                          ) : (
                            <Box className="w-3 h-3" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={
                                "truncate " +
                                (depth === 0
                                  ? "font-medium text-[var(--iamx-fg)]"
                                  : "text-[var(--iamx-fg)]")
                              }
                            >
                              {node.name}
                            </span>
                            {node.display_name && (
                              <span className="text-[11px] text-[var(--iamx-fg-muted)] hidden md:inline">
                                &quot;{node.display_name}&quot;
                              </span>
                            )}
                          </div>
                        </div>
                        {hasChildren && (
                          <Badge tone="neutral" size="xs">
                            {node.children!.length}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 align-middle">
                      <span className="font-mono text-[11.5px] text-[var(--iamx-fg-muted)]">
                        {node.code}
                      </span>
                    </td>
                    <td className="px-3 align-middle">
                      <span className="text-[12.5px] text-[var(--iamx-fg-muted)]">
                        {node.module_name || "—"}
                      </span>
                    </td>
                    <td className="px-3 text-center align-middle">
                      <span className="font-mono tabular-nums text-[11.5px]">{node.fiscal_year}</span>
                    </td>
                    <td className="px-3 align-middle">
                      <StatusPill active={active} />
                    </td>
                    <td
                      className="pr-4 pl-2 align-middle text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        {node.type === "process" && (
                          <IconButton
                            icon="plus"
                            label="เพิ่มขั้นย่อย"
                            onClick={() => openAddSubprocess(node.raw as RefProcess)}
                          />
                        )}
                        <IconButton icon="edit" label="แก้ไข" onClick={() => openEdit(node)} />
                        <IconButton
                          icon="trash"
                          label="ลบ"
                          variant="danger"
                          onClick={() => handleDelete(node)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add drawer */}
      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={addType === "process" ? "เพิ่มขั้นหลัก" : "เพิ่มขั้นย่อย"}
        subtitle={addParent ? `ภายใต้: ${addParent.process_name}` : `ปีงบฯ ${selectedFiscalYear}`}
        width={640}
        persistKey="iamx-drawer-process-add"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="check"
              onClick={handleSaveAdd}
              disabled={!addForm.code.trim() || !addForm.name.trim()}
            >
              สร้างขั้น
            </Button>
          </>
        }
      >
        <DrawerSection title="ข้อมูลพื้นฐาน">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
            <FormField label="รหัส" required>
              <Input
                value={addForm.code}
                onChange={(v) => setAddForm((p) => ({ ...p, code: v }))}
                placeholder={addType === "subprocess" ? "เช่น PROC001.1" : "เช่น PROC001"}
                maxLength={50}
                autoFocus
              />
            </FormField>
            <FormField label="ชื่อ" required>
              <Input
                value={addForm.name}
                onChange={(v) => setAddForm((p) => ({ ...p, name: v }))}
                placeholder="เช่น ขั้นยื่นคำขอ"
                maxLength={200}
              />
            </FormField>
            <FormField label="รหัสแสดงผล" hint="สำหรับแสดงบน UI">
              <Input
                value={addForm.display_code}
                onChange={(v) => setAddForm((p) => ({ ...p, display_code: v }))}
                placeholder="P01"
                maxLength={100}
              />
            </FormField>
            <FormField label="ชื่อแสดงผล" hint="optional">
              <Input
                value={addForm.display_name}
                onChange={(v) => setAddForm((p) => ({ ...p, display_name: v }))}
                placeholder="เช่น เสนอคำขอ"
                maxLength={500}
              />
            </FormField>
          </div>
        </DrawerSection>

        {addType === "process" && (
          <DrawerSection title="บริบท">
            <FormField label="โมดูล">
              <Input
                value={addForm.module_name}
                onChange={(v) => setAddForm((p) => ({ ...p, module_name: v }))}
                placeholder="เช่น การเงิน"
                maxLength={200}
              />
            </FormField>
          </DrawerSection>
        )}

        <DrawerSection title="สถานะ">
          <Select
            value={addForm.status}
            onChange={(v) => setAddForm((p) => ({ ...p, status: v }))}
            options={[
              { value: "ACTIVE", label: "ใช้งาน" },
              { value: "INACTIVE", label: "ไม่ใช้งาน" },
            ]}
          />
        </DrawerSection>
      </Drawer>

      {/* Edit drawer */}
      <Drawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editType === "process" ? `แก้ไขขั้นหลัก: ${editForm.name}` : `แก้ไขขั้นย่อย: ${editForm.name}`}
        subtitle={editForm.code ? `รหัส ${editForm.code} · ปีงบฯ ${editData?.fiscal_year}` : ""}
        width={640}
        persistKey="iamx-drawer-process-edit"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="primary" size="sm" icon="check" onClick={handleSaveEdit}>
              บันทึก
            </Button>
          </>
        }
      >
        <DrawerSection title="ข้อมูลพื้นฐาน">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
            <FormField label="รหัส" required>
              <Input
                value={editForm.code}
                onChange={(v) => setEditForm((p) => ({ ...p, code: v }))}
                maxLength={50}
              />
            </FormField>
            <FormField label="ชื่อ" required>
              <Input
                value={editForm.name}
                onChange={(v) => setEditForm((p) => ({ ...p, name: v }))}
                maxLength={200}
              />
            </FormField>
            <FormField label="รหัสแสดงผล">
              <Input
                value={editForm.display_code}
                onChange={(v) => setEditForm((p) => ({ ...p, display_code: v }))}
                maxLength={100}
              />
            </FormField>
            <FormField label="ชื่อแสดงผล">
              <Input
                value={editForm.display_name}
                onChange={(v) => setEditForm((p) => ({ ...p, display_name: v }))}
                maxLength={500}
              />
            </FormField>
          </div>
        </DrawerSection>

        {editType === "process" && (
          <DrawerSection title="บริบท">
            <FormField label="โมดูล">
              <Input
                value={editForm.module_name}
                onChange={(v) => setEditForm((p) => ({ ...p, module_name: v }))}
                maxLength={200}
              />
            </FormField>
          </DrawerSection>
        )}

        <DrawerSection title="สถานะ">
          <Select
            value={editForm.status}
            onChange={(v) => setEditForm((p) => ({ ...p, status: v }))}
            options={[
              { value: "ACTIVE", label: "ใช้งาน" },
              { value: "INACTIVE", label: "ไม่ใช้งาน" },
            ]}
          />
        </DrawerSection>
      </Drawer>

      {/* Clone drawer */}
      <Drawer
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        title="คัดลอกข้อมูลขั้นดำเนินการ"
        subtitle={`จากปี ${selectedFiscalYear}`}
        width={480}
        persistKey="iamx-drawer-process-clone"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCloneOpen(false)}
              disabled={isCloning}
            >
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="copy"
              disabled={isCloning || !cloneTargetYear || cloneTargetYear === selectedFiscalYear}
              onClick={handleClone}
            >
              {isCloning ? "กำลังคัดลอก..." : "คัดลอกข้อมูล"}
            </Button>
          </>
        }
      >
        <DrawerSection title="ปลายทาง">
          <FormField label="ไปยังปีงบประมาณ" required>
            <Select
              value={cloneTargetYear}
              onChange={setCloneTargetYear}
              options={fiscalYearOptions.map((y) => ({
                value: String(y),
                label: `${y}${String(y) === selectedFiscalYear ? " (ปีปัจจุบัน)" : ""}`,
              }))}
              placeholder="เลือกปีงบประมาณ"
            />
          </FormField>
          <div className="mt-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
            ระบบจะคัดลอกขั้นดำเนินการทั้งหมดจากปี {selectedFiscalYear} ไปยังปี{" "}
            {cloneTargetYear || "..."}
          </div>
        </DrawerSection>
      </Drawer>
    </div>
  );
}
