"use client";

import { tx } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { LogoMark } from "../components/iamx/Logo";
import { Asleep, Light } from "@carbon/icons-react";
import { isDarkNow, setTheme } from "@/lib/theme";

const REMEMBER_KEY = "iamx.login.username";

/** Only same-site paths: must start with "/" but not "//" or "/\\". */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.startsWith("/login")) return null;
  return raw;
}

type FormState = {
  username: string;
  password: string;
  remember: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, login } = useAuth();

  const [form, setForm] = useState<FormState>({
    username: "",
    password: "",
    remember: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{ username?: string; password?: string }>({});
  const [expired, setExpired] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [envLabel, setEnvLabel] = useState("");
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setIsDark(isDarkNow());
  }, []);
  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
    setIsDark(!isDark);
  };
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setExpired(params.get("expired") === "1");
    setNextPath(safeNext(params.get("next")));
    const h = window.location.hostname;
    setEnvLabel(h.startsWith("uat") || h.includes("uat-") ? "UAT" : h === "localhost" || h === "127.0.0.1" ? "LOCAL" : h.includes("sit") ? "SIT" : "PROD");
    let saved = "";
    try {
      saved = window.localStorage.getItem(REMEMBER_KEY) || "";
    } catch {
      /* storage unavailable */
    }
    if (saved) {
      setForm((s) => ({ ...s, username: saved }));
      setTimeout(() => passwordRef.current?.focus(), 0);
    } else {
      usernameRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) router.push(nextPath || "/settings");
  }, [isAuthenticated, router, nextPath]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!form.username.trim()) {
      setFieldError({ username: tx("กรุณากรอกชื่อผู้ใช้") });
      usernameRef.current?.focus();
      return;
    }
    if (!form.password) {
      setFieldError({ password: tx("กรุณากรอกรหัสผ่าน") });
      passwordRef.current?.focus();
      return;
    }
    setFieldError({});

    setLoading(true);
    setError("");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";
      const res = await fetch(`${apiUrl}/iamx/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setError(res.status === 429 ? "Too many failed sign-ins. Try again in 15 minutes." : tx("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"));
        return;
      }

      try {
        if (form.remember) window.localStorage.setItem(REMEMBER_KEY, form.username.trim());
        else window.localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* storage unavailable */
      }

      login(data.data.token, data.data.user);
      router.push(nextPath || "/settings");
    } catch (err) {
      console.error(err);
      setError(tx("เกิดข้อผิดพลาดในการเชื่อมต่อ"));
    } finally {
      setLoading(false);
    }
  };

  // พื้น #f4f4f4 · การ์ดขาว 420 pad 40 กลางจอ · โลโก้ 40 + ชื่อ 17/600 + คำอธิบาย 12 · หัว 22/400 mb20
  // label 12 #525252 mb8 · ช่อง 40 พื้น #f4f4f4 เส้นล่าง #8d8d8d pad 0 16 · ปุ่ม 48 #0f62fe · ข้อความท้าย 12
  const field = "w-full h-10 px-4 bg-[var(--l-field)] text-[var(--l-fg)] border-0 border-b text-[14px] rounded-none outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2";
  return (
    <div className="iamx-login relative min-h-screen w-full bg-[var(--l-bg)] text-[var(--l-fg)] flex items-center justify-center px-4 py-10">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Light mode" : "Dark mode"}
        className="absolute top-3 right-3 h-10 w-10 inline-flex items-center justify-center text-[var(--l-fg-2)] hover:text-[var(--l-fg)] hover:bg-[var(--l-field)]"
      >
        {isDark ? <Light size={20} /> : <Asleep size={20} />}
      </button>
      {envLabel && envLabel !== "PROD" && <span className="absolute top-5 left-4 text-[12px] tracking-[0.04em] text-[var(--l-fg-2)]">{envLabel}</span>}
      <section className="w-full max-w-[420px] bg-[var(--l-card)] p-10">
        <div className="flex items-center gap-3 mb-7">
          <LogoMark size={40} color="var(--l-mark)" accent="#0f62fe" stroke={5} />
          <div>
            <b className="block text-[17px] font-semibold leading-[1.2]">IAMX</b>
            <small className="block text-[12px] leading-[1.3] text-[var(--l-fg-2)]">Identity &amp; Access Management</small>
          </div>
        </div>
        <h1 className="text-[22px] font-normal leading-[1.29] mb-5">{tx("เข้าสู่ระบบ")}</h1>

        {expired && !error && (
          <div className="mb-4 px-4 py-3 text-[13px] bg-[var(--l-info)] border-l-[3px] border-[#0f62fe]">{tx("หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง")}</div>
        )}
        {error && (
          <div className="mb-4 px-4 py-3 text-[13px] bg-[var(--l-err-bg)] border-l-[3px] border-[var(--l-err)]">{error}</div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="login-username" className="block text-[12px] leading-[1.33] text-[var(--l-fg-2)] mb-2">{tx("ชื่อผู้ใช้")}</label>
          <input
            id="login-username"
            ref={usernameRef}
            value={form.username}
            onChange={(e) => {
              setForm((s) => ({ ...s, username: e.target.value }));
              if (fieldError.username) setFieldError({});
            }}
            type="text"
            aria-invalid={!!fieldError.username}
            autoComplete="username"
            className={field + (fieldError.username ? " border-[var(--l-err)]" : " border-[var(--l-line)]")}
          />
          {fieldError.username && <p className="mt-1 text-[12px] text-[var(--l-err)]">{fieldError.username}</p>}

          <label htmlFor="login-password" className="block mt-3 text-[12px] leading-[1.33] text-[var(--l-fg-2)] mb-2">{tx("รหัสผ่าน")}</label>
          <input
            id="login-password"
            ref={passwordRef}
            value={form.password}
            onChange={(e) => {
              setForm((s) => ({ ...s, password: e.target.value }));
              if (fieldError.password) setFieldError({});
            }}
            aria-invalid={!!fieldError.password}
            type="password"
            autoComplete="current-password"
            className={field + (fieldError.password ? " border-[var(--l-err)]" : " border-[var(--l-line)]")}
          />
          {fieldError.password && <p className="mt-1 text-[12px] text-[var(--l-err)]">{fieldError.password}</p>}

          <button
            type="submit"
            aria-busy={loading}
            disabled={loading}
            className="mt-5 w-full h-12 pl-[15px] pr-[63px] text-left bg-[var(--l-blue)] hover:bg-[var(--l-blue-h)] disabled:bg-[#8d8d8d] text-white text-[14px] focus-visible:outline-offset-[-4px] focus-visible:outline-white"
          >
            {loading ? tx("กำลังเข้าสู่ระบบ...") : tx("เข้าสู่ระบบ")}
          </button>
        </form>
        <p className="mt-5 text-[12px] leading-[1.43] text-[var(--l-fg-2)]">No account yet? Contact your administrator.</p>
      </section>
    </div>
  );
}
