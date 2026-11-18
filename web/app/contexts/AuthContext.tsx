"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

type AuthUser = {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  email?: string;
  role: string;
  status: string;
};

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isKeycloak: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  isKeycloak: false,
  login: () => {},
  logout: () => {},
});

// Idle timeout: 30 minutes (in milliseconds)
const IDLE_TIMEOUT = 30 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load user from localStorage on mount (JWT mode only)
  useEffect(() => {
    const initAuth = async () => {
      try {
        const savedToken = localStorage.getItem("token");
        const savedUser = localStorage.getItem("user");

        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      } catch (error) {
        console.error("Failed to load auth state:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = (newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    localStorage.setItem("lastActivity", Date.now().toString());
  };

  // 14/11/69: หมดเวลา (ไม่ได้ใช้งาน 30 นาที) → หน้า login บอกว่าหมดเวลา และกลับหน้าเดิมหลังเข้าใหม่ · กดออกเองไปหน้า login เฉย ๆ
  const logout = (expired = false) => {
    const next = expired ? window.location.pathname.replace(/^\/iamx/, "") + window.location.search : "";
    // 14/11/69: แจ้ง API ให้ยกเลิก token นี้ (ใช้ต่อไม่ได้อีก แม้ยังไม่หมดอายุ)
    try {
      const t = localStorage.getItem("token");
      if (t) {
        fetch(`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${t}` }, keepalive: true }).catch(() => {});
      }
    } catch { /* storage unavailable */ }
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("lastActivity");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    router.push(expired && next && !next.startsWith("/login") ? `/login?expired=1&next=${encodeURIComponent(next)}` : "/login");
  };

  // Reset idle timer
  const resetIdleTimer = () => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Update last activity time
    localStorage.setItem("lastActivity", Date.now().toString());

    scheduleIdleCheck(IDLE_TIMEOUT);
  };

  // lastActivity is shared by every console tab (localStorage), so a background tab must
  // not log out on its own timer while the user is active in another tab — logout clears the
  // shared token and would kick that tab out too. Re-check the shared time before logging out.
  const scheduleIdleCheck = (delay: number) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      const last = parseInt(localStorage.getItem("lastActivity") || "0");
      const idle = Date.now() - last;
      if (last && idle < IDLE_TIMEOUT) {
        scheduleIdleCheck(IDLE_TIMEOUT - idle);
        return;
      }
      console.log("Session expired due to inactivity");
      logout(true);
    }, delay);
  };

  // Setup idle timeout detection
  useEffect(() => {
    // Only setup idle detection if user is authenticated
    if (!token || !user) return;

    // Check if session has already expired
    const lastActivity = localStorage.getItem("lastActivity");
    if (lastActivity) {
      const timeSinceLastActivity = Date.now() - parseInt(lastActivity);
      if (timeSinceLastActivity >= IDLE_TIMEOUT) {
        console.log("Session expired");
        logout(true);
        return;
      }
    }

    // Initialize idle timer
    resetIdleTimer();

    // Events that indicate user activity
    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click"];

    // Add event listeners
    events.forEach((event) => {
      window.addEventListener(event, resetIdleTimer);
    });

    // Cleanup on unmount
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetIdleTimer);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [token, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        isKeycloak: false,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

// Helper hook for making authenticated API calls
export function useAuthFetch() {
  const { token } = useAuth();

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = {
      "Content-Type": "application/json",
      ...(token && { "Authorization": `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 - token expired or invalid
    if (response.status === 401) {
      const next = window.location.pathname.replace(/^\/iamx/, "") + window.location.search;
      window.location.href = `/iamx/login?expired=1&next=${encodeURIComponent(next)}`;
    }

    return response;
  };

  return authFetch;
}
