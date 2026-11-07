"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { UserDto } from "@kompanion/types";
import { useAuthStore } from "./auth-store";

/**
 * Central auth transitions. Every sign-in, registration, and sign-out passes
 * here so user-scoped query state is always isolated to the session that owns
 * it: a new session never inherits the previous user's cached mail.
 */
export function beginSession(queryClient: QueryClient, token: string, user: UserDto): void {
  queryClient.clear();
  useAuthStore.getState().setAuth(token, user);
}

export function endSession(queryClient?: QueryClient): void {
  useAuthStore.getState().logout();
  if (queryClient) void queryClient.clear();
}
