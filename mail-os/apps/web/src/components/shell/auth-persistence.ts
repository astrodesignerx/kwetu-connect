import { createJSONStorage } from "zustand/middleware";
import { useAuthStore } from "@/lib/auth-store";

type PersistedAuth = Pick<ReturnType<typeof useAuthStore.getState>, "token" | "user">;

export function remembersSession() {
  try { return localStorage.getItem("ccos-remember-me") !== "false"; } catch { return true; }
}

export function configureAuthPersistence(remember = remembersSession(), signingIn = false) {
  const storage = createJSONStorage<PersistedAuth>(() => remember ? localStorage : sessionStorage);
  if (storage) useAuthStore.persist.setOptions({ storage });
  if (signingIn) {
    try {
      localStorage.setItem("ccos-remember-me", String(remember));
      (remember ? sessionStorage : localStorage).removeItem("ccos-auth");
    } catch { /* The existing in-memory session remains available. */ }
  }
}
