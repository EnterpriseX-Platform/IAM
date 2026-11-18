"use client";

import { showError, showSuccess } from "@/lib/swal";
import {
  Box,
  Boxes,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Search,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

type SubprocessItem = {
  subprocessId?: string | null;
  subprocessCode?: string | null;
  subprocessName?: string | null;
};

type ProcessWithSubprocess = {
  processId?: string | null;
  displayCode?: string | null;
  displayName?: string | null;
  subprocesses: SubprocessItem[];
};

const API_URL = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";

const normalize = (x: any): ProcessWithSubprocess => ({
  processId: x.processId ?? x.PROCESS_ID ?? null,
  displayCode: x.displayCode ?? x.DISPLAY_CODE ?? null,
  displayName: x.displayName ?? x.DISPLAY_NAME ?? null,
  subprocesses: Array.isArray(x.subprocesses ?? x.SUBPROCESSES)
    ? (x.subprocesses ?? x.SUBPROCESSES).map((s: any) => ({
        subprocessId: s.subprocessId ?? s.SUBPROCESS_ID ?? null,
        subprocessCode: s.subprocessCode ?? s.SUBPROCESS_CODE ?? null,
        subprocessName: s.subprocessName ?? s.SUBPROCESS_NAME ?? null,
      }))
    : [],
});

export default function RefProcessesPage() {
  // สร้างปีงบประมาณแบบไดนามิก: ปีปัจจุบัน +5 ถึง -5
  const currentYear = new Date().getFullYear() + 543; // แปลงเป็นพุทธศักราช
  const fiscalYears = Array.from({ length: 11 }, (_, i) => currentYear + 5 - i);

  const [fy, setFy] = useState(currentYear.toString());
  const [rows, setRows] = useState<ProcessWithSubprocess[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");

  // pagination state (client-side)
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    type: "process" | "subprocess";
    data: ProcessWithSubprocess | SubprocessItem;
    processData?: ProcessWithSubprocess;
  } | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
  });

  // Clone Modal state
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloneFy, setCloneFy] = useState("");
  const [isCloning, setIsCloning] = useState(false);

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(
        `${API_URL}/iamx/api/ref-processes?fiscal_year=${encodeURIComponent(fy)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${res.status})`);

      const data = await res.json();

      const listRaw = Array.isArray(data) ? data : (data?.data ?? []);
      const list = (listRaw as any[]).map(normalize);

      // sort ให้เหมือน tree ในรูป (ตาม displayCode)
      list.sort((a, b) =>
        (a.displayCode || "").localeCompare(b.displayCode || ""),
      );

      setRows(list);

      // default: expand ทั้งหมด
      setExpanded(new Set(list.map((p) => p.processId || "")));
    } catch (e: any) {
      setError(e?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  const toggle = (pid?: string | null) => {
    if (!pid) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  // ---- search filter แบบ "คงโครง" (ถ้าลูก match ก็โชว์ parent)
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    const matchText = (t?: string | null) =>
      (t || "").toLowerCase().includes(s);

    return rows
      .map((p) => {
        const kids = (p.subprocesses || []).filter(
          (k) =>
            matchText(k.subprocessCode) ||
            matchText(k.subprocessName) ||
            matchText(k.subprocessId),
        );

        const parentMatch =
          matchText(p.displayCode) ||
          matchText(p.displayName) ||
          matchText(p.processId);

        if (parentMatch) return p;
        if (kids.length > 0) return { ...p, subprocesses: kids };
        return null;
      })
      .filter(Boolean) as ProcessWithSubprocess[];
  }, [rows, q]);

  // เวลา search: expand เฉพาะที่มีผลลัพธ์
  useEffect(() => {
    if (!q.trim()) return;
    setExpanded(new Set(filtered.map((p) => p.processId || "")));
  }, [q, filtered]);

  /** ===================== Client-side Pagination ===================== */
  const totalProcesses = filtered.length;
  const totalPages = Math.ceil(totalProcesses / limit);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * limit;
    const end = start + limit;
    return filtered.slice(start, end);
  }, [filtered, page, limit]);

  // Reset page เมื่อ search/fy เปลี่ยน
  useEffect(() => {
    setPage(1);
  }, [q, fy]);

  // ---- expand/collapse functions
  // const expandAll = () =>
  //   setExpanded(new Set(paginatedData.map((p) => p.processId || "")));
  // const collapseAll = () => setExpanded(new Set());

  // ---- Modal functions
  const openEditModal = (
    type: "process" | "subprocess",
    data: ProcessWithSubprocess | SubprocessItem,
    processData?: ProcessWithSubprocess,
  ) => {
    setEditingItem({ type, data, processData });
    if (type === "process") {
      const p = data as ProcessWithSubprocess;
      setEditFormData({
        name: p.displayName || "",
      });
    } else {
      const s = data as SubprocessItem;
      setEditFormData({
        name: s.subprocessName || "",
      });
    }
    setIsModalOpen(true);
  };

  const closeEditModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setEditFormData({ name: "" });
  };

  // Clone Modal functions
  const openCloneModal = () => {
    setCloneFy(fy); // ตั้งค่าเริ่มต้นเป็นปีปัจจุบัน
    setIsCloneModalOpen(true);
  };

  const closeCloneModal = () => {
    setIsCloneModalOpen(false);
    setCloneFy("");
  };

  const handleCloneData = async () => {
    if (!cloneFy) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือกปีงบประมาณ");
      return;
    }

    try {
      setIsCloning(true);

      const res = await fetch(`${API_URL}/iamx/api/ref-processes/clone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceFiscalYear: fy,
          targetFiscalYear: cloneFy,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        // ถ้ามีข้อมูลอยู่แล้ว
        if (result.code === "DUPLICATE") {
          showError("ข้อมูลซ้ำ", `ปี ${cloneFy} มีข้อมูลอยู่แล้ว`);
        } else {
          throw new Error(result.message || "Clone data failed");
        }
        return;
      }

      showSuccess("Clone สำเร็จ", `Clone ข้อมูลไปยังปี ${cloneFy} สำเร็จ`);
      closeCloneModal();

      // โหลดข้อมูลใหม่
      fetchData();
    } catch (e: any) {
      showError("เกิดข้อผิดพลาด", e?.message || "เกิดข้อผิดพลาดในการ Clone ข้อมูล");
    } finally {
      setIsCloning(false);
    }
  };

  const handleSaveEdit = async () => {
    // TODO: เพิ่ม API call สำหรับบันทึกข้อมูล
    console.log("Saving:", editingItem, editFormData);

    // ตัวอย่างการอัพเดท local state
    if (editingItem?.type === "process") {
      const p = editingItem.data as ProcessWithSubprocess;
      setRows((prev) =>
        prev.map((row) =>
          row.processId === p.processId
            ? {
                ...row,
                displayName: editFormData.name,
              }
            : row,
        ),
      );
    } else if (editingItem?.type === "subprocess") {
      const s = editingItem.data as SubprocessItem;
      const parentProcess = editingItem.processData;
      setRows((prev) =>
        prev.map((row) =>
          row.processId === parentProcess?.processId
            ? {
                ...row,
                subprocesses: row.subprocesses.map((sub) =>
                  sub.subprocessId === s.subprocessId
                    ? {
                        ...sub,
                        subprocessName: editFormData.name,
                      }
                    : sub,
                ),
              }
            : row,
        ),
      );
    }

    closeEditModal();
  };

  // ---- Drag and Drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDraggedOverIndex(index);
  };

  const handleDrop = async (
    e: React.DragEvent,
    processId: string,
    targetIndex: number,
  ) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDraggedOverIndex(null);
      return;
    }

    let updatedSubprocesses: SubprocessItem[] = [];

    setRows((prev) =>
      prev.map((row) => {
        if (row.processId === processId) {
          const newSubprocesses = [...row.subprocesses];
          const [removed] = newSubprocesses.splice(draggedIndex, 1);
          newSubprocesses.splice(targetIndex, 0, removed);

          // อัพเดทรหัส subprocess ตามลำดับใหม่
          updatedSubprocesses = newSubprocesses.map((sub, idx) => ({
            ...sub,
            subprocessCode: (idx + 1).toString(),
          }));

          return {
            ...row,
            subprocesses: updatedSubprocesses,
          };
        }
        return row;
      }),
    );

    setDraggedIndex(null);
    setDraggedOverIndex(null);

    // บันทึกลำดับใหม่ลง database
    try {
      const res = await fetch(
        `${API_URL}/iamx/api/ref-processes/${processId}/subprocess-order`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subprocesses: updatedSubprocesses.map((sub) => ({
              subprocessId: sub.subprocessId,
              subprocessCode: sub.subprocessCode,
            })),
          }),
        },
      );

      if (!res.ok) {
        throw new Error("Failed to update subprocess order");
      }

      // แสดงข้อความสำเร็จ (optional)
      console.log("อัพเดทลำดับ subprocess สำเร็จ");
    } catch (error: any) {
      console.error("Error updating subprocess order:", error);
      showError("เกิดข้อผิดพลาด", "เกิดข้อผิดพลาดในการบันทึกลำดับ");
      // Reload ข้อมูลใหม่ถ้าเกิด error
      fetchData();
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDraggedOverIndex(null);
  };

  // ---- helper: ทำเลขแบบรูป 2
  const makeLevelNo = (p: ProcessWithSubprocess, child?: SubprocessItem) => {
    const pNo = (p.displayCode || "").trim() || "-";
    if (!child) return pNo;
    const cNo = (child.subprocessCode || "").trim() || "-";
    return `${pNo}.${cNo}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-full">
        <div className="bg-white shadow-sm border p-5 h-full">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-bold text-gray-900">
                โครงสร้าง Process / Subprocess
              </div>
              <div className="text-sm text-gray-500">
                แสดงแบบ Tree ยุบ/ขยาย (ตามรูปตัวอย่าง)
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 rounded-lg border border-blue-200 shadow-sm">
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  ปีงบประมาณ:
                </span>
                <select
                  className="h-9 rounded-lg border border-blue-300 px-3 pr-8 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer font-semibold text-gray-800 shadow-sm hover:shadow-md"
                  value={fy}
                  onChange={(e) => setFy(e.target.value)}
                >
                  {fiscalYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              {/* <button
                onClick={expandAll}
                className="h-10 px-3 rounded-lg border bg-white hover:bg-gray-50 text-sm"
              >
                ขยายทั้งหมด
              </button>
              <button
                onClick={collapseAll}
                className="h-10 px-3 rounded-lg border bg-white hover:bg-gray-50 text-sm"
              >
                ย่อทั้งหมด
              </button> */}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                className="w-full h-10 pl-10 pr-3 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ค้นหา (process / subprocess / code)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button
              onClick={openCloneModal}
              className="h-10 px-4 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Clone Data
            </button>
          </div>

          <div className="mt-5">
            {loading && (
              <div className="py-10 text-center text-gray-500">
                กำลังโหลด...
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3">
                {error}
              </div>
            )}

            {!loading && !error && paginatedData.length === 0 && (
              <div className="py-10 text-center text-gray-500">ไม่พบข้อมูล</div>
            )}

            {!loading && !error && paginatedData.length > 0 && (
              <div className="space-y-2">
                {paginatedData.map((p) => {
                  const pid = p.processId || "";
                  const isOpen = expanded.has(pid);

                  return (
                    <div
                      key={pid}
                      className="rounded-xl border bg-white overflow-hidden"
                    >
                      {/* ===== Process row (เหมือนหัวข้อใหญ่ในรูป 2) ===== */}
                      <button
                        type="button"
                        onClick={() => toggle(pid)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-lg border flex items-center justify-center bg-gray-50">
                            {isOpen ? (
                              <ChevronDown size={18} />
                            ) : (
                              <ChevronRight size={18} />
                            )}
                          </div>

                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-purple-100 to-indigo-100 border border-purple-300 shadow-sm">
                            <Boxes className="text-purple-700" size={16} />
                          </div>

                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-sm font-semibold text-gray-700 w-[54px]">
                              {makeLevelNo(p)}
                            </span>

                            <span className="font-semibold text-gray-900 truncate">
                              {p.displayName || "-"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal("process", p);
                            }}
                            className="p-2 rounded-lg hover:bg-blue-50 transition-colors group"
                            title="แก้ไข Process"
                          >
                            <Pencil
                              className="text-gray-500 group-hover:text-blue-600"
                              size={16}
                            />
                          </button>
                        </div>
                      </button>

                      {/* ===== Subprocess children ===== */}
                      {isOpen && (
                        <div className="px-4 pb-3">
                          {(p.subprocesses || []).length === 0 ? (
                            <div className="pl-10 py-3 text-sm text-gray-500">
                              ไม่มี subprocess
                            </div>
                          ) : (
                            <div className="space-y-2 pl-10 border-l">
                              {(p.subprocesses || []).map((s, idx) => (
                                <div
                                  key={(s.subprocessId || "") + idx}
                                  draggable
                                  onDragStart={() => handleDragStart(idx)}
                                  onDragOver={(e) => handleDragOver(e, idx)}
                                  onDrop={(e) => handleDrop(e, pid, idx)}
                                  onDragEnd={handleDragEnd}
                                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-all cursor-move ${
                                    draggedIndex === idx
                                      ? "opacity-50 scale-95"
                                      : draggedOverIndex === idx
                                        ? "bg-blue-50 border-2 border-blue-300 border-dashed"
                                        : "hover:bg-gray-50 border-2 border-transparent"
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 border border-gray-300 cursor-grab active:cursor-grabbing">
                                      <GripVertical
                                        className="text-gray-400"
                                        size={16}
                                      />
                                    </div>

                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 border border-blue-300 shadow-sm">
                                      <Box
                                        className="text-blue-700"
                                        size={16}
                                      />
                                    </div>

                                    <span className="text-sm text-gray-700 w-[68px] shrink-0">
                                      {makeLevelNo(p, s)}
                                    </span>

                                    <span className="text-sm text-gray-900 truncate">
                                      {s.subprocessName || "-"}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditModal("subprocess", s, p);
                                      }}
                                      className="p-2 rounded-lg hover:bg-blue-50 transition-colors group"
                                      title="แก้ไข Subprocess"
                                    >
                                      <Pencil
                                        className="text-gray-500 group-hover:text-blue-600"
                                        size={16}
                                      />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {!loading && !error && totalPages > 1 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t">
                <div className="text-sm text-gray-700">
                  แสดง {(page - 1) * limit + 1} ถึง{" "}
                  {Math.min(page * limit, totalProcesses)} จาก {totalProcesses}{" "}
                  processes
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
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
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
                    })}
                  </div>

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
      </div>

      {/* Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                แก้ไข{" "}
                {editingItem?.type === "process" ? "Process" : "Subprocess"}
              </h2>
              <button
                onClick={closeEditModal}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ชื่อ{" "}
                  {editingItem?.type === "process" ? "Process" : "Subprocess"}
                </label>
                <input
                  type="text"
                  className="input-minimal w-full h-10 px-3 rounded-lg border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={editFormData.name}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, name: e.target.value })
                  }
                  placeholder="กรอกชื่อ"
                  autoFocus
                />
              </div>

              {editingItem?.type === "subprocess" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    💡 <strong>เคล็ดลับ:</strong> ใช้ไอคอน{" "}
                    <GripVertical className="inline" size={14} /> เพื่อลากและวาง
                    Subprocess เรียงลำดับใหม่ รหัสจะอัพเดทอัตโนมัติตามลำดับ
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-gray-700 font-medium"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-white font-medium"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Data Modal */}
      {isCloneModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                Clone ข้อมูล Process / Subprocess
              </h2>
              <button
                onClick={closeCloneModal}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>จากปีงบประมาณ:</strong> {fy}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ไปยังปีงบประมาณ:
                </label>
                <select
                  className="h-9 rounded-lg border border-blue-300 px-3 pr-8 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer font-semibold text-gray-800 shadow-sm hover:shadow-md w-full"
                  value={cloneFy}
                  onChange={(e) => setCloneFy(e.target.value)}
                >
                  <option value="">เลือกปีงบประมาณ</option>
                  {fiscalYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>หมายเหตุ:</strong> ระบบจะคัดลอกข้อมูล Process และ
                  Subprocess ทั้งหมดจากปี {fy} ไปยังปี {cloneFy || "..."}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={closeCloneModal}
                disabled={isCloning}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCloneData}
                disabled={isCloning || !cloneFy}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCloning ? "กำลัง Clone..." : "Clone ข้อมูล"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
