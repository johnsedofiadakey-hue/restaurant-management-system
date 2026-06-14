"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/authContext";
import { LuSettings, LuClipboard, LuChefHat, LuConciergeBell } from "react-icons/lu";

const DASHBOARDS = [
  { path: "/admin",      label: "Admin",      Icon: LuSettings,       roles: ["admin"] },
  { path: "/supervisor", label: "Supervisor", Icon: LuClipboard,      roles: ["admin", "supervisor"] },
  { path: "/kitchen",    label: "Kitchen",    Icon: LuChefHat,        roles: ["admin", "supervisor", "kitchen"] },
  { path: "/waiter",     label: "Waiter",     Icon: LuConciergeBell,  roles: ["admin", "supervisor", "waiter"] },
];

export default function DashboardNav({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { role } = useAuth();

  const available = DASHBOARDS.filter(d => role && d.roles.includes(role) && d.path !== current);
  if (available.length === 0) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.5rem 1rem", background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px",
          color: "white", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer",
          transition: "background 0.15s"
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
      >
        Switch Dashboard
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 99,
            background: "white", border: "1px solid #E0E0E0", borderRadius: "12px",
            boxShadow: "0 16px 40px rgba(0,0,0,0.15)", overflow: "hidden", minWidth: "200px"
          }}>
            <div style={{ padding: "0.5rem 1rem 0.375rem", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9E9E9E" }}>
              Go to
            </div>
            {available.map(d => (
              <button key={d.path}
                onClick={() => { setOpen(false); router.push(d.path); }}
                style={{
                  display: "flex", alignItems: "center", gap: "0.75rem",
                  width: "100%", padding: "0.75rem 1rem", border: "none",
                  background: "transparent", cursor: "pointer", textAlign: "left",
                  fontSize: "0.9375rem", fontWeight: 700, color: "#212121",
                  transition: "background 0.12s"
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ width: "28px", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
                  <d.Icon size={18} />
                </span>
                {d.label} Dashboard
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
