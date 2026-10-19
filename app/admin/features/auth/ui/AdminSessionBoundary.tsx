import { createContext, useContext, type ReactNode } from "react";
import type { AdminUser } from "../../../types";
import { useAdminSession } from "../model/useAdminSession";

const AdminSession = createContext<AdminUser | null | undefined>(undefined);

export function useAdminUser(): AdminUser | null {
  const user = useContext(AdminSession);
  if (user === undefined) throw new Error("AdminSessionBoundary is required");
  return user;
}

function AuthenticatedSession({ user, children }: { user: AdminUser; children: ReactNode }) {
  const blocked = useAdminSession(user.expiresAt);
  return blocked ? <main role="status">로그인이 필요합니다.</main> : <AdminSession.Provider value={user}>{children}</AdminSession.Provider>;
}

export function AdminSessionBoundary({ user, children }: { user: AdminUser | null; children: ReactNode }) {
  return user ? <AuthenticatedSession user={user}>{children}</AuthenticatedSession>
    : <AdminSession.Provider value={null}>{children}</AdminSession.Provider>;
}
