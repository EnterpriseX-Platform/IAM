"use client";

import {
  Badge,
  Button,
  Drawer,
  DrawerSection,
  EmptyState,
  Input,
  PageHeader,
  Tabs,
  Toolbar,
} from "@/app/components/iamx";
import { showError } from "@/lib/swal";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { Check, Shield, User } from "@/app/components/iamx/carbonLucide";
import { useEffect, useMemo, useState } from "react";
import { permLabel, sortPerms } from "../../components/iamx/perms";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

const DEFAULT_PERMISSIONS = ["VIEW", "EXPORT", "PRINT"];

// ========================= Types =========================
// GET /reports/codes ของ Report Studio คืนแค่ code + name
interface Report {
  code: string;
  name: string;
}

interface OwnerMapping {
  id: number;
  role_id?: string;
  user_id?: string;
  report_code: string;
  permissions: string[];
}

interface MappingCount {
  role_count: number;
  user_count: number;
}

interface Role {
  id: string;
  code: string;
  name: string;
  is_active: number;
}

interface UserInfo {
  user_id: string;
  user_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  status?: string;
}

type DrawerTab = "roles" | "users";

// ========================= Page =========================
export default function ReportMappingPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [reportSource, setReportSource] = useState<string>("");
  const [summary, setSummary] = useState<Record<string, MappingCount>>({});
  const [permissionTypesRaw, setPermissionTypes] = useState<string[]>(DEFAULT_PERMISSIONS);
  const permissionTypes = sortPerms(permissionTypesRaw);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Drawer
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("roles");
  const [roleMappings, setRoleMappings] = useState<OwnerMapping[]>([]);
  const [userMappings, setUserMappings] = useState<OwnerMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEscapeKey(!!selectedReport, () => setSelectedReport(null));

  // ========================= Loaders =========================
  const loadReports = async () => {
    const res = await fetch(`${API_BASE}/admin/reports`);
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || "ไม่สามารถดึงรายงานจาก Report Studio ได้");
    }
    setReports(json.data || []);
    setReportSource(json.source || "");
  };

  const loadSummary = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/report-mappings/summary`);
      const json = await res.json();
      if (json.success) setSummary(json.data || {});
    } catch {
      // นับไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย — ตารางยังใช้งานได้
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [permRes, roleRes, userRes] = await Promise.all([
          fetch(`${API_BASE}/admin/permission-types?group=REPORT`),
          fetch(`${API_BASE}/admin/roles`),
          fetch(`${API_BASE}/users`),
        ]);
        const [permJson, roleJson, userJson] = await Promise.all([
          permRes.json(),
          roleRes.json(),
          userRes.json(),
        ]);

        const perms = (permJson.data || []).map((p: any) => p.permission_type).filter(Boolean);
        if (perms.length > 0) setPermissionTypes(perms);
        setRoles(roleJson.data || []);
        setUsers(userJson.data || []);

        await Promise.all([loadReports(), loadSummary()]);
      } catch (e: any) {
        showError("ไม่สามารถโหลดข้อมูลได้", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load both owner lists when a report is opened
  useEffect(() => {
    if (!selectedReport) {
      setRoleMappings([]);
      setUserMappings([]);
      return;
    }

    const code = encodeURIComponent(selectedReport.code);
    let cancelled = false;
    setLoadingMappings(true);

    Promise.all([
      fetch(`${API_BASE}/admin/reports/${code}/role-mappings`).then((r) => r.json()),
      fetch(`${API_BASE}/admin/reports/${code}/user-mappings`).then((r) => r.json()),
    ])
      .then(([roleJson, userJson]) => {
        if (cancelled) return;
        setRoleMappings(roleJson.data || []);
        setUserMappings(userJson.data || []);
      })
      .catch((e) => {
        if (!cancelled) showError("ไม่สามารถโหลดสิทธิ์รายงานได้", e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingMappings(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedReport?.code]);

  // ========================= Permission writes =========================
  const setPermissions = async (
    kind: DrawerTab,
    ownerId: string,
    next: string[],
    pendingKeys: string[]
  ) => {
    if (!selectedReport) return;
    const code = encodeURIComponent(selectedReport.code);

    const url =
      kind === "roles"
        ? `${API_BASE}/admin/roles/${ownerId}/reports/${code}/set-permissions`
        : `${API_BASE}/admin/users/${ownerId}/reports/${code}/set-permissions`;

    setPending((prev) => {
      const s = new Set(prev);
      pendingKeys.forEach((k) => s.add(k));
      return s;
    });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "บันทึกไม่สำเร็จ");

      const apply = (prev: OwnerMapping[]): OwnerMapping[] => {
        const idOf = (m: OwnerMapping) => (kind === "roles" ? m.role_id : m.user_id);
        if (next.length === 0) return prev.filter((m) => idOf(m) !== ownerId);
        if (!prev.some((m) => idOf(m) === ownerId)) {
          return [
            ...prev,
            {
              id: json.data?.id ?? 0,
              report_code: selectedReport.code,
              permissions: next,
              ...(kind === "roles" ? { role_id: ownerId } : { user_id: ownerId }),
            },
          ];
        }
        return prev.map((m) => (idOf(m) === ownerId ? { ...m, permissions: next } : m));
      };

      const updated = apply(kind === "roles" ? roleMappings : userMappings);
      if (kind === "roles") setRoleMappings(updated);
      else setUserMappings(updated);

      const nextCount = updated.length;
      setSummary((prev) => {
        const cur = prev[selectedReport.code] || { role_count: 0, user_count: 0 };
        return {
          ...prev,
          [selectedReport.code]: {
            ...cur,
            [kind === "roles" ? "role_count" : "user_count"]: nextCount,
          },
        };
      });
    } catch (e: any) {
      showError("บันทึกไม่สำเร็จ", e.message);
    } finally {
      setPending((prev) => {
        const s = new Set(prev);
        pendingKeys.forEach((k) => s.delete(k));
        return s;
      });
    }
  };

  const currentMappings = drawerTab === "roles" ? roleMappings : userMappings;

  const permsOf = (ownerId: string) =>
    currentMappings.find((m) => (drawerTab === "roles" ? m.role_id : m.user_id) === ownerId)
      ?.permissions || [];

  const togglePermission = (ownerId: string, perm: string) => {
    const current = permsOf(ownerId);
    const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
    setPermissions(drawerTab, ownerId, next, [`${ownerId}-${perm}`]);
  };

  const toggleOwnerAll = (ownerId: string, on: boolean) => {
    setPermissions(
      drawerTab,
      ownerId,
      on ? [...permissionTypes] : [],
      permissionTypes.map((p) => `${ownerId}-${p}`)
    );
  };

  const refreshReports = async () => {
    setLoading(true);
    try {
      await Promise.all([loadReports(), loadSummary()]);
    } catch (e: any) {
      showError("ไม่สามารถโหลดรายงานได้", e.message);
    } finally {
      setLoading(false);
    }
  };

  // ========================= Derived =========================
  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) => r.name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q)
    );
  }, [reports, search]);

  const userLabel = (u: UserInfo) =>
    [u.first_name, u.last_name].filter(Boolean).join(" ") || u.user_name || u.email || u.user_id;

  // Owners with permissions float to the top, like the users page role tab
  const ownerRows = useMemo(() => {
    const q = ownerSearch.trim().toLowerCase();

    const rows =
      drawerTab === "roles"
        ? roles
            .filter(
              (r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
            )
            .map((r) => ({ id: r.id, title: r.name, subtitle: r.code, inactive: !r.is_active }))
        : users
            .filter(
              (u) =>
                !q ||
                [u.user_name, u.first_name, u.last_name, u.email]
                  .filter(Boolean)
                  .some((v) => String(v).toLowerCase().includes(q))
            )
            .map((u) => ({
              id: u.user_id,
              title: userLabel(u),
              subtitle: u.email || u.user_name || "-",
              inactive: false,
            }));

    const granted = rows.filter((r) => permsOf(r.id).length > 0);
    const rest = rows.filter((r) => permsOf(r.id).length === 0);
    return { granted, rest };
  }, [drawerTab, roles, users, ownerSearch, currentMappings]);

  // ========================= Render helpers =========================
  const PermCell = ({
    on,
    pendingFlag,
    onClick,
  }: {
    on: boolean;
    pendingFlag: boolean;
    onClick: () => void;
  }) => {
    if (pendingFlag) {
      return (
        <div className="inline-flex items-center justify-center">
          <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={onClick}
        className={
          "inline-flex h-5 w-5 items-center justify-center rounded transition-colors " +
          (on
            ? "bg-[var(--iamx-accent)] text-white"
            : "bg-layer border border-[var(--iamx-border-strong)] hover:border-[var(--iamx-accent)]")
        }
      >
        {on && <Check className="w-3 h-3" strokeWidth={3} />}
      </button>
    );
  };

  const renderOwnerRow = (row: {
    id: string;
    title: string;
    subtitle: string;
    inactive: boolean;
  }) => {
    const perms = permsOf(row.id);
    const allOn = perms.length === permissionTypes.length && permissionTypes.length > 0;
    const someOn = perms.length > 0 && !allOn;

    return (
      <tr
        key={row.id}
        className="border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)]"
        style={{ height: "var(--iamx-row-h)" }}
      >
        <td className="pl-4 pr-3 align-middle" style={{ maxWidth: 260, minWidth: 180 }}>
          <div className="flex items-center gap-2 min-w-0">
            {drawerTab === "roles" ? (
              <Shield className="w-3.5 h-3.5 text-[var(--iamx-fg-muted)] shrink-0" />
            ) : (
              <User className="w-3.5 h-3.5 text-[var(--iamx-fg-muted)] shrink-0" />
            )}
            <div className="min-w-0">
              <div className="truncate text-[var(--iamx-fg)]" title={row.title}>
                {row.title}
              </div>
              <div className="text-[11px] text-[var(--iamx-fg-muted)] truncate">
                {row.subtitle}
                {row.inactive && <span className="text-red-600 ml-1.5">ปิดใช้</span>}
              </div>
            </div>
          </div>
        </td>
        {permissionTypes.map((perm) => (
          <td key={perm} className="px-2 text-center align-middle" style={{ width: 56 }}>
            <PermCell
              on={perms.includes(perm)}
              pendingFlag={pending.has(`${row.id}-${perm}`)}
              onClick={() => togglePermission(row.id, perm)}
            />
          </td>
        ))}
        <td className="px-2 text-center align-middle" style={{ width: 56 }}>
          <button
            type="button"
            onClick={() => toggleOwnerAll(row.id, !allOn)}
            title={allOn ? "ถอนสิทธิ์ทั้งหมด" : "ให้สิทธิ์ทั้งหมด"}
            className={
              "inline-flex h-5 w-5 items-center justify-center rounded transition-colors " +
              (allOn
                ? "bg-[var(--iamx-accent)] text-white"
                : someOn
                ? "bg-[var(--iamx-accent-soft)] text-[var(--iamx-accent)] border border-[var(--iamx-accent)]"
                : "bg-layer border border-[var(--iamx-border-strong)] hover:border-[var(--iamx-accent)]")
            }
          >
            {allOn && <Check className="w-3 h-3" strokeWidth={3} />}
            {someOn && <span className="w-2 h-[2px] bg-[var(--iamx-accent)]" />}
          </button>
        </td>
      </tr>
    );
  };

  const renderOwnerTable = () => (
    <table className="cds--data-table cds--data-table--sm w-full text-[13px] border-collapse min-w-[520px]">
      <thead className="bg-[var(--iamx-bg-hover)] sticky top-0 z-10">
        <tr className="border-b border-[var(--iamx-border)]">
          <th
            className="text-left h-9 pl-4 pr-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]"
            style={{ maxWidth: 260, minWidth: 180 }}
          >
            {drawerTab === "roles" ? "บทบาท" : "ผู้ใช้"}
          </th>
          {permissionTypes.map((p) => (
            <th
              key={p}
              className="h-9 px-2 text-center font-medium text-[11.5px] text-[var(--iamx-fg-muted)]"
              style={{ width: 56 }}
            >
              {permLabel(p)}
            </th>
          ))}
          <th
            className="h-9 px-2 text-center font-medium text-[11.5px] text-[var(--iamx-fg-muted)]"
            style={{ width: 56 }}
          >
            ทั้งหมด
          </th>
        </tr>
      </thead>
      <tbody>
        {ownerRows.granted.length > 0 && (
          <>
            <tr className="bg-[var(--iamx-surface)]/60 border-b border-[var(--iamx-border)]">
              <td
                colSpan={permissionTypes.length + 2}
                className="pl-4 pr-3 py-1.5 text-[11.5px] font-medium text-[var(--iamx-fg-muted)]"
              >
                ให้สิทธิ์แล้ว ({ownerRows.granted.length})
              </td>
            </tr>
            {ownerRows.granted.map(renderOwnerRow)}
          </>
        )}
        {ownerRows.rest.length > 0 && (
          <>
            <tr className="bg-[var(--iamx-surface)]/60 border-b border-[var(--iamx-border)]">
              <td
                colSpan={permissionTypes.length + 2}
                className="pl-4 pr-3 py-1.5 text-[11.5px] font-medium text-[var(--iamx-fg-muted)]"
              >
                {drawerTab === "roles" ? "บทบาทอื่น" : "ผู้ใช้อื่น"} ({ownerRows.rest.length})
              </td>
            </tr>
            {ownerRows.rest.map(renderOwnerRow)}
          </>
        )}
      </tbody>
    </table>
  );

  // ========================= Render =========================
  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="รายงาน และสิทธิ์"
        description="เลือกรายงานเพื่อกำหนดว่าบทบาทใดหรือผู้ใช้คนใดเข้าถึงได้"
        actions={
          <div className="flex items-center gap-2">
            {reportSource === "mock" && (
              <Badge tone="warning" size="sm" dot>
                ข้อมูลรายงานจำลอง
              </Badge>
            )}
            <Button variant="secondary" icon="refresh" onClick={refreshReports}>
              โหลดรายงานใหม่
            </Button>
          </div>
        }
      />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหา ชื่อรายงาน หรือรหัส..."
        right={
          <span className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">
            {filteredReports.length} รายงาน
          </span>
        }
      />

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>
          </div>
        ) : filteredReports.length === 0 ? (
          <EmptyState
            icon={search ? "search" : "fileText"}
            title={search ? `ไม่พบ "${search}"` : "ไม่มีรายงาน"}
            hint={
              search ? "ลองค้นด้วยคำอื่น" : "Report Studio ยังไม่มีรายงาน หรือเชื่อมต่อไม่ได้"
            }
          />
        ) : (
          <table className="cds--data-table cds--data-table--sm w-full text-[13px] border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--iamx-bg)]">
              <tr className="border-b border-[var(--iamx-border)]">
                <th className="w-12 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  #
                </th>
                <th className="text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  ชื่อรายงาน
                </th>
                <th className="w-52 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  รหัส
                </th>
                <th className="w-28 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  บทบาท
                </th>
                <th className="w-28 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  ผู้ใช้
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report, index) => {
                const counts = summary[report.code];
                return (
                  <tr
                    key={report.code}
                    onClick={() => {
                      setDrawerTab("roles");
                      setOwnerSearch("");
                      setSelectedReport(report);
                    }}
                    className="group/row border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)] cursor-pointer"
                    style={{ height: "var(--iamx-row-h)" }}
                  >
                    <td className="px-3 align-middle">
                      <span className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-3 align-middle">
                      <div className="text-[var(--iamx-fg)] truncate" title={report.name}>
                        {report.name}
                      </div>
                    </td>
                    <td className="px-3 align-middle">
                      <span className="font-mono text-[11.5px] text-[var(--iamx-fg-muted)]">
                        {report.code}
                      </span>
                    </td>
                    <td className="px-3 align-middle">
                      {counts?.role_count ? (
                        <Badge tone="accent" size="sm">
                          {counts.role_count} บทบาท
                        </Badge>
                      ) : (
                        <span className="text-[12px] text-[var(--iamx-fg-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 align-middle">
                      {counts?.user_count ? (
                        <Badge tone="accent" size="sm">
                          {counts.user_count} คน
                        </Badge>
                      ) : (
                        <span className="text-[12px] text-[var(--iamx-fg-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {filteredReports.length > 0 && (
          <div className="px-6 py-3 text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">
            แสดง 1–{filteredReports.length} จาก {reports.length}
          </div>
        )}
      </div>

      {/* Per-report drawer: who gets this report */}
      <Drawer
        open={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        title={selectedReport?.name || ""}
        subtitle={selectedReport?.code}
        width={720}
        persistKey="iamx-drawer-report"
        headerExtra={
          <Badge tone="neutral" size="sm">
            {roleMappings.length} บทบาท · {userMappings.length} ผู้ใช้
          </Badge>
        }
      >
        <div className="sticky top-0 z-10 bg-[var(--iamx-bg)] px-5 pt-1">
          <Tabs
            value={drawerTab}
            onChange={(v) => {
              setDrawerTab(v as DrawerTab);
              setOwnerSearch("");
            }}
            tabs={[
              { value: "roles", label: "บทบาท", count: roleMappings.length },
              { value: "users", label: "รายบุคคล", count: userMappings.length },
            ]}
          />
        </div>

        <DrawerSection
          title={drawerTab === "roles" ? "บทบาทที่เข้าถึงรายงานนี้" : "ผู้ใช้ที่เข้าถึงรายงานนี้"}
          description={
            drawerTab === "roles"
              ? "ติ๊กสิทธิ์เพื่อผูกรายงานนี้เข้ากับบทบาท — มีผลกับผู้ใช้ทุกคนในบทบาทนั้น"
              : "สิทธิ์เฉพาะบุคคล ใช้เมื่อไม่อยากให้ทั้งบทบาทเห็นรายงานนี้"
          }
        >
          <div className="mb-3">
            <Input
              value={ownerSearch}
              onChange={setOwnerSearch}
              placeholder={drawerTab === "roles" ? "ค้นหา บทบาท..." : "ค้นหา ผู้ใช้..."}
              icon="search"
            />
          </div>

          {loadingMappings ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>
            </div>
          ) : ownerRows.granted.length === 0 && ownerRows.rest.length === 0 ? (
            <EmptyState
              icon="search"
              title={ownerSearch ? `ไม่พบ "${ownerSearch}"` : "ไม่มีข้อมูล"}
              hint={ownerSearch ? "ลองคำอื่น" : undefined}
            />
          ) : (
            <div className="overflow-x-auto border border-[var(--iamx-border)] rounded-md bg-layer">
              {renderOwnerTable()}
            </div>
          )}
        </DrawerSection>
      </Drawer>
    </div>
  );
}
