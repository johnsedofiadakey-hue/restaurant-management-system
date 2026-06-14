"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, UserRole } from "../lib/authContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/login");
      } else if (role && !allowedRoles.includes(role)) {
        // If logged in but wrong role, send them back to their proper dashboard or home
        router.push("/"); 
      }
    }
  }, [user, role, loading, router, allowedRoles]);

  if (loading) {
    return <div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>;
  }

  if (!user || (role && !allowedRoles.includes(role))) {
    return null; // Don't render anything while redirecting
  }

  return <>{children}</>;
}
