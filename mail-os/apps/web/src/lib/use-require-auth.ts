"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "./auth-store";

export function useRequireAuth(requiredRole?: "Admin") {
  const router = useRouter();
  const { token, user, hydrated } = useAuthStore();

  useEffect(() => {
    if (!hydrated) return;
    if (!token) router.replace("/login");
    else if (requiredRole === "Admin" && user?.role !== "Admin")
      router.replace("/settings/mailboxes");
  }, [hydrated, token, user, requiredRole, router]);

  return {
    ready: hydrated && !!token && (!requiredRole || user?.role === requiredRole),
    user,
  };
}
