"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDto } from "@kompanion/types";

interface AuthState {
  token: string | null;
  user: UserDto | null;
  hydrated: boolean;
  setAuth: (token: string, user: UserDto) => void;
  setUser: (user: UserDto) => void;
  logout: () => void;
  setHydrated: () => void;
}

// JWT lives in localStorage (standard tradeoff for a same-origin internal SPA;
// httpOnly cookie sessions are noted as future hardening).
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hydrated: false,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "ccos-auth",
      skipHydration: true,
      partialize: (s) => ({ token: s.token, user: s.user }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);
