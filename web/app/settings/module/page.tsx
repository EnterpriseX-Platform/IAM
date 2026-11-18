"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { showSuccess, showError, showConfirm } from "@/lib/swal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

interface App {
  appId: number;
  appName: string | null;
  status: string | null;
}

interface System {
  systemId: number;
  systemName: string | null;
  systemAbv: string | null;
  systemDesc: string | null;
  status: string | null;
  systemLogo: string | null;
  systemTypeMainId: string | null;
  createDate: string | null;
}

interface ModuleDisplay {
  id: number;
  name: string;
  abv?: string | null;
  description: string;
  status: "Active" | "Inactive";
  icon: string;
  color: string;
  appId?: number | null;
  appName?: string | null;
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

export default function ModulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get app context from URL
  const urlAppId = searchParams.get('appId');
  const urlAppName = searchParams.get('appName');

  const [modules, setModules] = useState<ModuleDisplay[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [appsLoading, setAppsLoading] = useState(false);

  // list controls
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Active" | "Inactive"
  >("All");

  // modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    abv: "",
    description: "",
    appId: urlAppId || "",
  });

  // kebab menu
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  // Fetch apps list
  const fetchApps = async () => {
    try {
      setAppsLoading(true);
      const response = await fetch(
        `${API_BASE}/iamx/api/apps?page=1&limit=100&status=Active`
      );
      const data = await response.json();

      if (data.data) {
        setApps(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch apps:", error);
    } finally {
      setAppsLoading(false);
    }
  };

  // Fetch modules from API
  const fetchModules = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: "1",
        limit: "100",
      });

      if (search) params.append("search", search);
      if (statusFilter !== "All") params.append("status", statusFilter);

      const response = await fetch(
        `${API_BASE}/iamx/api/systems?${params.toString()}`
      );
      const data = await response.json();

      if (data.data) {
        // Fetch apps to get app names
        const appsResponse = await fetch(
          `${API_BASE}/iamx/api/apps?page=1&limit=100`
        );
        const appsData = await appsResponse.json();
        const appsMap = new Map(
          appsData.data?.map((app: App) => [app.appId, app.appName]) || []
        );

        let displayModules: ModuleDisplay[] = data.data.map(
          (system: System, index: number) => {
            const iconColor = iconColors[index % iconColors.length];
            // Use systemTypeMainId as appId
            const appId = system.systemTypeMainId
              ? parseInt(system.systemTypeMainId)
              : null;
            return {
              id: system.systemId,
              name: system.systemName || "Unnamed System",
              abv: system.systemAbv,
              description: system.systemDesc || "ไม่มีคำอธิบาย",
              status: (system.status as "Active" | "Inactive") || "Inactive",
              icon: iconColor.icon,
              color: iconColor.color,
              appId: appId,
              appName: appId ? appsMap.get(appId) || null : null,
            };
          }
        );

        // Filter by appId if provided in URL
        if (urlAppId) {
          displayModules = displayModules.filter(
            (m) => m.appId === parseInt(urlAppId)
          );
        }

        setModules(displayModules);
      }
    } catch (error) {
      console.error("Failed to fetch modules:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch modules on mount and when filters change
  useEffect(() => {
    fetchModules();
  }, [search, statusFilter, urlAppId]);

  // Fetch apps when modal opens (only if not using URL app context)
  useEffect(() => {
    if (isModalOpen && !urlAppId) {
      fetchApps();
    }
  }, [isModalOpen, urlAppId]);

  // ESC close modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsModalOpen(false);
    };
    if (isModalOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (openMenuId !== null) {
        setOpenMenuId(null);
      }
    };
    if (openMenuId !== null) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
    return undefined;
  }, [openMenuId]);

  const counts = useMemo(() => {
    const active = modules.filter((m) => m.status === "Active").length;
    const inactive = modules.length - active;
    return { total: modules.length, active, inactive };
  }, [modules]);

  // No need to filter here since API already filters
  const filteredModules = modules;

  const closeModal = () => {
    setIsModalOpen(false);
    setForm({ name: "", abv: "", description: "", appId: urlAppId || "" });
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.appId) return;

    try {
      const response = await fetch(`${API_BASE}/iamx/api/systems`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_name: form.name.trim(),
          system_abv: form.abv.trim() || null,
          system_desc: form.description.trim() || null,
          system_type_main_id: form.appId.toString(),
          status: "Active",
        }),
      });

      if (response.ok) {
        closeModal();
        fetchModules(); // Refresh list
      } else {
        console.error("Failed to create system");
      }
    } catch (error) {
      console.error("Error creating system:", error);
    }
  };

  const handleDelete = async (systemId: number) => {
    const ok = await showConfirm("ยืนยันการลบ", "คุณต้องการลบโมดูลนี้หรือไม่?");
    if (!ok) return;

    try {
      const response = await fetch(`${API_BASE}/iamx/api/systems/${systemId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        showSuccess("สำเร็จ", "ลบโมดูลสำเร็จ");
        fetchModules(); // Refresh list
        setOpenMenuId(null);
      } else {
        showError("ผิดพลาด", "ไม่สามารถลบโมดูลได้");
        console.error("Failed to delete system");
      }
    } catch (error) {
      showError("ผิดพลาด", "เกิดข้อผิดพลาดในการลบโมดูล");
      console.error("Error deleting system:", error);
    }
  };

  const StatusPill = ({ status }: { status: "Active" | "Inactive" }) => (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
        status === "Active"
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-gray-50 text-gray-600 ring-1 ring-gray-200",
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          status === "Active" ? "bg-emerald-500" : "bg-gray-400",
        )}
      />
      {status === "Active" ? "Active" : "Inactive"}
    </span>
  );

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
            <span className="font-semibold text-gray-900">Modules</span>
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
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500 text-xl font-bold text-white">
                  M
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Modules{urlAppName && ` - ${urlAppName}`}
                  </h1>
                  <p className="text-sm text-gray-600">
                    {urlAppName
                      ? `จัดการโมดูลสำหรับ ${urlAppName}`
                      : "จัดการโมดูลทั้งหมดของแอป"}
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
                  Total Modules
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {counts.total}
                </p>
                <p className="mt-3 text-sm text-gray-500">
                  โมดูลทั้งหมดในระบบ
                </p>
              </div>
              <IconTile className="bg-violet-50 text-violet-700">📋</IconTile>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600">
                  Active Modules
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {counts.active}
                </p>
                <p className="mt-3 text-sm text-gray-500">โมดูลที่กำลังใช้งาน</p>
              </div>
              <IconTile className="bg-emerald-50 text-emerald-700">✅</IconTile>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600">
                  Inactive Modules
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {counts.inactive}
                </p>
                <p className="mt-3 text-sm text-gray-500">โมดูลที่ไม่ได้ใช้งาน</p>
              </div>
              <IconTile className="bg-gray-50 text-gray-600">⏸️</IconTile>
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
                placeholder="ค้นหาโมดูล..."
                className="w-full rounded-xl border border-gray-200 bg-white px-10 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">สถานะ</span>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as typeof statusFilter)
                }
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
              >
                <option value="All">ทั้งหมด</option>
                <option value="Active">ใช้งาน</option>
                <option value="Inactive">ไม่ใช้งาน</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <span className="grid h-5 w-5 place-items-center rounded-md bg-white/15">
              +
            </span>
            เพิ่มโมดูล
          </button>
        </div>

        {/* Modules section - full width */}
        <div className="mt-6">
          <Card>
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">
                  รายการโมดูล
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
              ) : filteredModules.length === 0 ? (
                <div className="grid place-items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-14 text-center">
                  <div className="text-3xl">📦</div>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    No modules found
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    ลองเปลี่ยนคำค้นหาหรือสถานะ
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {filteredModules.map((module) => (
                    <div
                      key={module.id}
                      className="relative rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,.02)] transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                      onClick={() =>
                        router.push(
                          `/settings/object?moduleId=${module.id}&moduleName=${encodeURIComponent(module.name)}&appName=${encodeURIComponent(urlAppName || "")}`
                        )
                      }
                    >
                      <div className="flex items-start justify-between">
                        <div
                          className={clsx(
                            "grid h-11 w-11 place-items-center rounded-2xl border border-gray-200 text-lg",
                            module.color,
                          )}
                        >
                          {module.icon}
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusPill status={module.status} />
                          {/* Kebab Menu */}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(
                                  openMenuId === module.id ? null : module.id,
                                );
                              }}
                              className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            </button>

                            {/* Dropdown Menu */}
                            {openMenuId === module.id && (
                              <div
                                className="absolute right-0 top-10 z-10 w-40 rounded-xl border border-gray-200 bg-white shadow-lg"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    console.log("Edit module:", module.id);
                                  }}
                                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-t-xl"
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
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                  แก้ไข
                                </button>
                                <button
                                  onClick={() => handleDelete(module.id)}
                                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 rounded-b-xl"
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
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                  ลบ
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <h4 className="mt-4 text-sm font-bold text-gray-900">
                        {module.abv || module.name}
                      </h4>
                      {module.appName && (
                        <p className="mt-1 text-xs text-blue-600 font-semibold">
                          📱 {module.appName}
                        </p>
                      )}
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                        {module.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  เพิ่มโมดูลใหม่
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  กรอกข้อมูลสำหรับสร้างโมดูล
                </p>
              </div>
              <button
                onClick={closeModal}
                className="rounded-xl p-2 text-gray-500 hover:bg-gray-50"
                aria-label="close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* App selection - read-only if from URL, dropdown otherwise */}
              {urlAppId && urlAppName ? (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    แอปพลิเคชัน
                  </label>
                  <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 flex items-center gap-2">
                    <span className="text-lg">📱</span>
                    <span className="font-medium">{urlAppName}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    เลือกแอป <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.appId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, appId: e.target.value }))
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    disabled={appsLoading}
                  >
                    <option value="">
                      {appsLoading ? "กำลังโหลด..." : "-- เลือกแอป --"}
                    </option>
                    {apps.map((app) => (
                      <option key={app.appId} value={app.appId}>
                        {app.appName || `App #${app.appId}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  ชื่อโมดูล <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="เช่น User Management"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  ชื่อย่อ
                </label>
                <input
                  value={form.abv}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, abv: e.target.value }))
                  }
                  placeholder="เช่น UM"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  คำอธิบาย
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="อธิบายสั้นๆ เกี่ยวกับโมดูล"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleAdd}
                disabled={!form.name.trim() || !form.appId}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
