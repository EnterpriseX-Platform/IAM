"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./contexts/AuthContext";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        // Redirect to dashboard (settings)
        router.push("/settings");
      } else {
        // Redirect to login
        router.push("/login");
      }
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading while checking authentication
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-foreground border-r-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">กำลังโหลด...</p>
      </div>
    </div>
  );
}
