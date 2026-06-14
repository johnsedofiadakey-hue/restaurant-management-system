"use client";

import { useState, useEffect, useRef } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import styles from "./page.module.css";
import { useAuth } from "../../lib/authContext";
import { auth, db, storage, firebaseConfig } from "../../lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, onSnapshot, doc, deleteDoc, setDoc, getDoc, query, orderBy, addDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { QRCodeSVG } from "qrcode.react";
import { useToast } from "../../components/Toast";
import DashboardNav from "../../components/DashboardNav";
import { LuMonitor, LuQrCode, LuUser, LuPalette, LuActivity, LuPrinter, LuChefHat, LuConciergeBell, LuClipboard, LuArmchair, LuX, LuUtensils, LuShoppingBag, LuBike, LuFlame, LuCreditCard, LuBanknote } from "react-icons/lu";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1.25rem", paddingBottom: "0.75rem", borderBottom: "2px solid var(--border)" }}>
      <div style={{ width: "4px", height: "1.2em", background: "#D32F2F", borderRadius: "2px", flexShrink: 0 }} />
      <h2 style={{ fontSize: "1.125rem", fontWeight: 800, color: "#212121", letterSpacing: "-0.02em" }}>{children}</h2>
    </div>
  );
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffRole, setStaffRole] = useState("waiter");
  const [loadingStaff, setLoadingStaff] = useState(false);

  const [tables, setTables] = useState<any[]>([]);
  const [newTable, setNewTable] = useState("");
  const [newTableSeats, setNewTableSeats] = useState<number>(4);
  const [qrTheme, setQrTheme] = useState("classic");
  const [selectedTableQR, setSelectedTableQR] = useState<string | null>(null);

  const [staffList, setStaffList] = useState<any[]>([]);

  // Branding / customisation
  const [brandName, setBrandName] = useState("Kyekye");
  const [brandTagline, setBrandTagline] = useState("Fresh · Flavourful · Made with love");
  const [brandColor, setBrandColor] = useState("#D32F2F");
  const [savingBrand, setSavingBrand] = useState(false);
  const [currentHeroUrl, setCurrentHeroUrl] = useState("");
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroImagePreview, setHeroImagePreview] = useState("");
  const [heroImageProgress, setHeroImageProgress] = useState<number | null>(null);
  const [savingHero, setSavingHero] = useState(false);
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  const [todaysSales, setTodaysSales] = useState(0);
  const [todaysOrders, setTodaysOrders] = useState(0);
  const [todaysTopItems, setTodaysTopItems] = useState<any[]>([]);
  const [allOrdersToday, setAllOrdersToday] = useState<any[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [activeTables, setActiveTables] = useState(0);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [peakHours, setPeakHours] = useState<any[]>([]);
  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#AF19FF"];

  useEffect(() => {
    getDoc(doc(db, "settings", "branding")).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.name) setBrandName(d.name);
        if (d.tagline) setBrandTagline(d.tagline);
        if (d.color) setBrandColor(d.color);
        if (d.heroImage) setCurrentHeroUrl(d.heroImage);
      }
    });

    const unsubTables = onSnapshot(collection(db, "tables"), (snap) => {
      setTables(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const q = query(collection(db, "orders"), orderBy("timestamp", "asc"));
    const unsubOrders = onSnapshot(q, (snap) => {
      let sales = 0;
      let count = 0;
      const active = new Set<string>();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const last7Days: Record<string, number> = {};
      const itemCounts: Record<string, number> = {};
      const hours: Record<string, number> = {};

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days[d.toLocaleDateString("en-US", { weekday: "short" })] = 0;
      }

      docs.forEach(d => {
        const data = d as any;
        if (data.status === "cancelled") return;
        count++;
        if (data.status !== "completed") active.add(data.tableNumber);

        if (data.timestamp?.toMillis) {
          const dateObj = new Date(data.timestamp.toMillis());
          if (dateObj.toDateString() === new Date().toDateString()) sales += data.total || 0;
          const dayStr = dateObj.toLocaleDateString("en-US", { weekday: "short" });
          if (last7Days[dayStr] !== undefined) last7Days[dayStr] += data.total || 0;
          const hourStr = dateObj.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
          hours[hourStr] = (hours[hourStr] || 0) + 1;
        }

        if (data.items) {
          data.items.forEach((item: any) => {
            itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.quantity || item.qty || 1);
          });
        }
      });

      const todayDocs = docs.filter((d: any) => {
        if (d.status === "cancelled") return false;
        if (!d.timestamp?.toMillis) return false;
        return new Date(d.timestamp.toMillis()).toDateString() === new Date().toDateString();
      });
      const todayItemMap: Record<string, number> = {};
      todayDocs.forEach((d: any) => {
        (d as any).items?.forEach((item: any) => {
          todayItemMap[item.name] = (todayItemMap[item.name] || 0) + (item.quantity || item.qty || 1);
        });
      });
      setTodaysOrders(todayDocs.length);
      setAllOrdersToday(todayDocs);
      setTodaysTopItems(Object.keys(todayItemMap).map(name => ({ name, qty: todayItemMap[name] })).sort((a, b) => b.qty - a.qty).slice(0, 8));

      setTodaysSales(sales);
      setTotalOrders(count);
      setActiveTables(active.size);
      setRevenueData(Object.keys(last7Days).map(day => ({ name: day, revenue: last7Days[day] })));
      setTopItems(Object.keys(itemCounts).map(name => ({ name, value: itemCounts[name] })).sort((a, b) => b.value - a.value).slice(0, 5));
      setPeakHours(Object.keys(hours).map(time => ({ time, orders: hours[time] })).sort((a, b) => b.orders - a.orders).slice(0, 5));
    });

    const unsubStaff = onSnapshot(collection(db, "users"), (snap) => {
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubTables(); unsubOrders(); unsubStaff(); };
  }, []);

  const handleDeleteStaff = async (id: string) => {
    if (!confirm("Revoke access for this staff member?")) return;
    await deleteDoc(doc(db, "users", id));
    toast("Staff access revoked.", "success");
  };

  const handleChangeRole = async (id: string, newRole: string) => {
    await setDoc(doc(db, "users", id), { role: newRole }, { merge: true });
    toast("Role updated.", "success");
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingStaff(true);
    // Use a uniquely named secondary app to avoid polluting the primary auth session
    const secondaryApp = initializeApp(firebaseConfig, `staff-create-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, staffEmail, staffPassword);
      await setDoc(doc(db, "users", userCredential.user.uid), { email: staffEmail, role: staffRole });
      toast(`Account created for ${staffEmail}!`, "success");
      setStaffEmail("");
      setStaffPassword("");
    } catch (err: any) {
      toast("Error creating staff: " + err.message, "error");
    } finally {
      await secondaryAuth.signOut();
      await deleteApp(secondaryApp); // clean up secondary instance
      setLoadingStaff(false);
    }
  };

  const handleGenerateQR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTable.trim()) return;
    await addDoc(collection(db, "tables"), { name: newTable.trim(), seats: newTableSeats });
    toast(`${newTable.trim()} added.`, "success");
    setNewTable("");
    setNewTableSeats(4);
  };

  const handleDeleteTable = async (id: string) => {
    if (!confirm("Delete this table?")) return;
    await deleteDoc(doc(db, "tables", id));
    toast("Table deleted.", "info");
  };

  const downloadQR = (elementId: string, label: string) => {
    const svg = document.getElementById(elementId);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    const isNight = qrTheme === "night";
    const bg = isNight ? "#1A1614" : "#FFFFFF";
    const fg = isNight ? "#FFFFFF" : "#111111";
    const accent = brandColor || "#D32F2F";
    const restaurantName = brandName || "Kyekye Cuisine";
    const isUniversal = elementId === "universal-qr";
    img.onload = () => {
      const qrSize = img.width;
      const padH = 48;
      const padV = 48;
      const topBand = 80;   // restaurant name bar
      const bottomBand = 76; // table name + scan text
      canvas.width = qrSize + padH * 2;
      canvas.height = qrSize + padV * 2 + topBand + bottomBand;
      if (!ctx) return;

      // Background
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Top accent bar
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, canvas.width, topBand);

      // Restaurant name in top bar
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 26px 'Inter', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(restaurantName, canvas.width / 2, topBand / 2 + 10);

      // QR code
      ctx.drawImage(img, padH, topBand + padV);

      // Table label
      ctx.fillStyle = fg;
      ctx.font = "bold 20px 'Inter', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(isUniversal ? "All Tables" : label, canvas.width / 2, topBand + padV + qrSize + 34);

      // Scan sub-text
      ctx.fillStyle = isNight ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)";
      ctx.font = "13px 'Inter', Arial, sans-serif";
      ctx.fillText("Scan to browse menu & order", canvas.width / 2, topBand + padV + qrSize + 58);

      // Bottom accent line
      ctx.fillStyle = accent;
      ctx.fillRect(0, canvas.height - 6, canvas.width, 6);

      const link = document.createElement("a");
      link.download = `${restaurantName.replace(/\s+/g, "-")}-QR-${label.replace(/\s+/g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const esc = (s: any) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

  const printShiftReport = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
    const itemRows = todaysTopItems.map(i =>
      `<tr><td>${esc(i.name)}</td><td style="text-align:right;font-weight:700">${Number(i.qty)}</td></tr>`
    ).join("");
    const orderRows = allOrdersToday.slice(0, 30).map((o: any) =>
      `<tr>
        <td>${esc(o.tableNumber)}</td>
        <td>${o.items?.map((i: any) => `${Number(i.quantity || i.qty || 1)}× ${esc(i.name)}`).join(", ") ?? ""}</td>
        <td style="text-align:right">₵${Number(o.total || 0).toFixed(2)}</td>
        <td style="text-align:center">${o.paymentStatus === "paid_online" ? "Card" : "Cash"}</td>
      </tr>`
    ).join("");

    const win = window.open("", "_blank", "width=700,height=900");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Shift Report — ${dateStr}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; font-size:13px; padding:32px; color:#111; max-width:680px; margin:0 auto; }
        h1 { font-size:22px; font-weight:900; letter-spacing:-1px; }
        h2 { font-size:14px; font-weight:700; margin:20px 0 8px; text-transform:uppercase; letter-spacing:0.06em; color:#666; border-bottom:1px solid #eee; padding-bottom:4px; }
        .meta { color:#666; font-size:12px; margin-top:4px; }
        .stats { display:flex; gap:16px; margin:16px 0; }
        .stat { flex:1; background:#f5f5f5; padding:12px; border-radius:8px; text-align:center; }
        .stat-value { font-size:24px; font-weight:900; color:#D32F2F; }
        .stat-label { font-size:11px; color:#888; margin-top:2px; text-transform:uppercase; letter-spacing:0.05em; }
        table { width:100%; border-collapse:collapse; margin-top:8px; }
        th { font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#888; padding:6px 4px; border-bottom:1px solid #ddd; text-align:left; }
        td { padding:5px 4px; border-bottom:1px solid #f0f0f0; vertical-align:top; line-height:1.4; }
        .footer { margin-top:24px; font-size:11px; color:#aaa; text-align:center; }
        @media print { body { padding:16px; } }
      </style></head><body>
      <h1>Kyekye Cuisine</h1>
      <p class="meta">Shift Report · ${dateStr} · Printed at ${timeStr}</p>
      <div class="stats">
        <div class="stat"><div class="stat-value">₵${todaysSales.toFixed(2)}</div><div class="stat-label">Total Revenue</div></div>
        <div class="stat"><div class="stat-value">${todaysOrders}</div><div class="stat-label">Orders</div></div>
        <div class="stat"><div class="stat-value">₵${todaysOrders > 0 ? (todaysSales / todaysOrders).toFixed(2) : "0.00"}</div><div class="stat-label">Avg Order</div></div>
      </div>
      <h2>Top Selling Items</h2>
      <table><thead><tr><th>Item</th><th style="text-align:right">Sold</th></tr></thead>
      <tbody>${itemRows || "<tr><td colspan='2' style='color:#aaa'>No sales today</td></tr>"}</tbody></table>
      <h2>Order Log (Today)</h2>
      <table><thead><tr><th>Table</th><th>Items</th><th style="text-align:right">Total</th><th style="text-align:center">Pay</th></tr></thead>
      <tbody>${orderRows || "<tr><td colspan='4' style='color:#aaa'>No orders today</td></tr>"}</tbody></table>
      <div class="footer">Kyekye POS · kyekyecuisine.web.app</div>
      <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
      </body></html>
    `);
    win.document.close();
  };

  const saveBranding = async () => {
    setSavingBrand(true);
    await setDoc(doc(db, "settings", "branding"), { name: brandName, tagline: brandTagline, color: brandColor }, { merge: true });
    toast("Branding saved — customer menu will update instantly.", "success");
    setSavingBrand(false);
  };

  const saveHeroImage = () => {
    if (!heroImageFile) return;
    setSavingHero(true);
    const storageRef = ref(storage, `branding/hero-${Date.now()}`);
    const task = uploadBytesResumable(storageRef, heroImageFile);
    task.on("state_changed",
      snap => setHeroImageProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      () => { toast("Upload failed.", "error"); setSavingHero(false); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await setDoc(doc(db, "settings", "branding"), { heroImage: url, heroImagePath: storageRef.fullPath }, { merge: true });
        setCurrentHeroUrl(url);
        setHeroImageFile(null);
        setHeroImagePreview("");
        setHeroImageProgress(null);
        setSavingHero(false);
        toast("Hero image updated — live on customer menu.", "success");
      }
    );
  };

  const qrBg = "#ffffff";
  const qrFg = "#111111";

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Admin Command Center</h1>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <DashboardNav current="/admin" />
            <button className={styles.btn} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white" }} onClick={() => router.push("/settings")}>Settings</button>
            <button className={styles.btn} onClick={() => auth.signOut()}>Sign Out</button>
          </div>
        </header>

        {/* Sticky jump-nav */}
        <div style={{ background: "var(--white)", borderBottom: "1px solid var(--border)", padding: "0 1.5rem", display: "flex", gap: "0", overflowX: "auto" as const, scrollbarWidth: "none" as const }}>
          {([
            { id: "dashboards",        label: "Dashboards",  Icon: LuMonitor },
            { id: "qrcodes",           label: "QR Codes",    Icon: LuQrCode },
            { id: "staff-section",     label: "Staff",       Icon: LuUser },
            { id: "customise-section", label: "Customise",   Icon: LuPalette },
            { id: "analytics-section", label: "Analytics",   Icon: LuActivity },
            { id: "report-section",    label: "Report",      Icon: LuPrinter },
          ] as const).map(l => (
            <a key={l.id} href={`#${l.id}`}
              style={{ padding: "0.875rem 1.125rem", fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" as const, textDecoration: "none", borderBottom: "2px solid transparent", transition: "color 0.15s, border-color 0.15s", display: "flex", alignItems: "center", gap: "0.4rem" }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--red)"; (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = "var(--red)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = "transparent"; }}>
              <l.Icon size={13} /> {l.label}
            </a>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════
            SINGLE SCROLLABLE PAGE — everything visible at once
        ═══════════════════════════════════════════════════════ */}
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "3rem" }}>

          {/* ── TODAY'S NUMBERS ── */}
          <div>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <h3>Today's Revenue</h3>
                <div className={styles.statValue} style={{ color: "var(--red)" }}>₵{todaysSales.toFixed(2)}</div>
              </div>
              <div className={styles.statCard}>
                <h3>Orders Today</h3>
                <div className={styles.statValue}>{todaysOrders}</div>
              </div>
              <div className={styles.statCard}>
                <h3>Active Tables</h3>
                <div className={styles.statValue}>{activeTables}</div>
              </div>
            </div>
          </div>

          {/* ── STAFF DASHBOARDS ── */}
          <div id="dashboards">
            <SectionTitle>Staff Dashboards</SectionTitle>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              Tap any card to open that screen. Open each one on the right device — kitchen monitor, waiter tablet, supervisor laptop.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
              {([
                { label: "Kitchen Display", desc: "Live order queue · mark done · 86 items", Icon: LuChefHat, bg: "var(--black)", path: "/kitchen" },
                { label: "Waiter Floor", desc: "Alerts · print bills · close tabs · manual orders", Icon: LuConciergeBell, bg: "var(--red)", path: "/waiter" },
                { label: "Supervisor", desc: "Menu items · live orders · reviews · floor plan", Icon: LuClipboard, bg: "#1565C0", path: "/supervisor" },
              ] as const).map(d => (
                <button key={d.path} onClick={() => router.push(d.path)}
                  style={{ background: d.bg, color: "white", border: "none", borderRadius: "var(--r-xl)", padding: "1.5rem", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: "0.875rem", transition: "transform 0.15s, box-shadow 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 40px rgba(0,0,0,0.25)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}>
                  <span style={{ opacity: 0.9 }}><d.Icon size={32} strokeWidth={1.5} /></span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.01em", marginBottom: "0.3rem" }}>{d.label}</div>
                    <div style={{ fontSize: "0.8rem", opacity: 0.8, lineHeight: 1.5 }}>{d.desc}</div>
                  </div>
                  <div style={{ marginTop: "auto", fontSize: "0.8rem", fontWeight: 700, opacity: 0.65 }}>Open dashboard →</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── QR CODES & TABLES ── */}
          <div id="qrcodes">
            <SectionTitle>QR Codes & Tables</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>

              {/* Universal QR */}
              <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "2rem", textAlign: "center" }}>
                <p style={{ fontWeight: 800, fontSize: "1rem", marginBottom: "0.5rem" }}>Universal QR Code</p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "1.5rem" }}>Works for all tables — customer picks their table at checkout</p>
                <div style={{ background: "#111", padding: "1.5rem", display: "inline-flex", flexDirection: "column", alignItems: "center", borderRadius: "var(--r-lg)", marginBottom: "1.5rem" }}>
                  <QRCodeSVG id="universal-qr" value={`${APP_URL}/menu`} size={200} bgColor="#111111" fgColor="#ffffff" level="H" includeMargin={false} />
                  <span style={{ fontSize: "0.65rem", color: "white", fontWeight: 700, letterSpacing: "0.1em", marginTop: "0.75rem" }}>SCAN TO ORDER</span>
                </div>
                <button className={styles.btn} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }} onClick={() => downloadQR("universal-qr", "Universal")}>
                  <LuPrinter size={15} /> Download Branded PNG
                </button>
              </div>

              {/* Add tables + per-table QRs */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem" }}>
                  <p style={{ fontWeight: 800, marginBottom: "0.375rem" }}>Add a Table</p>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "1rem" }}>Each table gets its own QR with the name pre-filled</p>
                  <form style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }} onSubmit={handleGenerateQR}>
                    <input type="text" placeholder="Table name (e.g. Table 5)" value={newTable} onChange={e => setNewTable(e.target.value)} required
                      style={{ flex: 2, minWidth: "140px", padding: "0.75rem 1rem", border: "1.5px solid var(--border)", borderRadius: "var(--r-md)", fontSize: "0.9375rem" }} />
                    <div style={{ display: "flex", alignItems: "center", border: "1.5px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                      <span style={{ padding: "0 0.625rem", background: "var(--ash-pale)", color: "var(--text-muted)", borderRight: "1px solid var(--border)", height: "100%", display: "flex", alignItems: "center" }}><LuArmchair size={15} /></span>
                      <input type="number" min="1" max="30" value={newTableSeats} onChange={e => setNewTableSeats(Number(e.target.value))}
                        style={{ width: "50px", padding: "0.75rem 0.5rem", border: "none", fontWeight: 700, textAlign: "center", fontSize: "0.9375rem" }} title="Seats" />
                    </div>
                    <button type="submit" className={styles.btn}>Add</button>
                  </form>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", maxHeight: "400px", overflowY: "auto" }}>
                  {tables.length === 0 && (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", padding: "1rem 0" }}>No tables yet — add your first table above.</p>
                  )}
                  {tables.map(table => (
                    <div key={table.id} style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.875rem 1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontWeight: 800 }}>{table.name}</span>
                          {table.seats && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.2rem" }}><LuArmchair size={12} /> {table.seats}</span>}
                        </div>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button onClick={() => setSelectedTableQR(selectedTableQR === table.id ? null : table.id)}
                            style={{ background: "var(--red)", color: "white", border: "none", borderRadius: "var(--r-sm)", padding: "0.3rem 0.75rem", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem" }}>
                            {selectedTableQR === table.id ? "Hide QR" : "QR Code"}
                          </button>
                          <button onClick={() => handleDeleteTable(table.id)}
                            style={{ background: "transparent", color: "var(--red)", border: "1px solid var(--red)", borderRadius: "var(--r-sm)", padding: "0.3rem 0.5rem", cursor: "pointer", display: "flex", alignItems: "center" }}><LuX size={14} /></button>
                        </div>
                      </div>
                      {selectedTableQR === table.id && (
                        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                          <div style={{ background: "#fff", padding: "1.25rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
                            <QRCodeSVG id={`qr-${table.id}`} value={`${APP_URL}/menu?table=${encodeURIComponent(table.name)}`}
                              size={160} bgColor="#ffffff" fgColor="#111111" level="H" includeMargin={false} />
                            <p style={{ textAlign: "center", fontWeight: 800, marginTop: "0.625rem", fontSize: "0.875rem" }}>{table.name}</p>
                          </div>
                          <button className={styles.btn} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }} onClick={() => downloadQR(`qr-${table.id}`, table.name)}>
                            <LuPrinter size={15} /> Download {table.name} QR
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── STAFF MANAGEMENT ── */}
          <div id="staff-section">
            <SectionTitle>Staff Accounts</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
              {/* Create form */}
              <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem" }}>
                <p style={{ fontWeight: 800, marginBottom: "1.25rem" }}>Create New Staff Account</p>
                <form onSubmit={handleCreateStaff}>
                  <div className={styles.formGroup}>
                    <label>Email Address</label>
                    <input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} placeholder="staff@kyekye.com" required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Password</label>
                    <input type="password" value={staffPassword} onChange={e => setStaffPassword(e.target.value)} placeholder="Min 6 characters" required minLength={6} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Role</label>
                    <select value={staffRole} onChange={e => setStaffRole(e.target.value)}>
                      <option value="waiter">Waiter</option>
                      <option value="kitchen">Kitchen</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button type="submit" className={styles.btn} style={{ width: "100%" }} disabled={loadingStaff}>
                    {loadingStaff ? "Creating account…" : "Create Account"}
                  </button>
                </form>
              </div>

              {/* Staff list */}
              <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem" }}>
                <p style={{ fontWeight: 800, marginBottom: "1.25rem" }}>Staff Directory ({staffList.length})</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "400px", overflowY: "auto" }}>
                  {staffList.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No staff accounts yet.</p>}
                  {staffList.map(staff => (
                    <div key={staff.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 1rem", background: "var(--ash-pale)", borderRadius: "var(--r-md)", gap: "0.75rem", flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: "0.9375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staff.email}</p>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{staff.role}</p>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                        <select value={staff.role} onChange={e => handleChangeRole(staff.id, e.target.value)}
                          style={{ padding: "0.35rem 0.625rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--border)", fontSize: "0.8rem", fontWeight: 700, background: "var(--white)" }}>
                          <option value="waiter">Waiter</option>
                          <option value="kitchen">Kitchen</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="admin">Admin</option>
                        </select>
                        {staff.id !== user?.uid && (
                          <button onClick={() => handleDeleteStaff(staff.id)}
                            style={{ background: "var(--red-light)", color: "var(--red)", border: "none", borderRadius: "var(--r-sm)", padding: "0.35rem 0.625rem", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem" }}>
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── CUSTOMISE ── */}
          <div id="customise-section">
            <SectionTitle>Customise Customer Menu</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>

              {/* Hero image */}
              <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem" }}>
                <p style={{ fontWeight: 800, marginBottom: "0.375rem" }}>Hero Photo</p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "1.25rem" }}>Shown at the top of the customer menu. Wide format, min 1200×600px recommended.</p>
                {currentHeroUrl && !heroImagePreview && (
                  <div style={{ marginBottom: "1.25rem", borderRadius: "var(--r-lg)", overflow: "hidden", height: 160, position: "relative" }}>
                    <img src={currentHeroUrl} alt="Current hero" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "white", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "var(--r-full)" }}>Current</div>
                  </div>
                )}
                {heroImagePreview && (
                  <div style={{ marginBottom: "1.25rem", borderRadius: "var(--r-lg)", overflow: "hidden", height: 160, position: "relative" }}>
                    <img src={heroImagePreview} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", bottom: 8, left: 8, background: "#22C55E", color: "white", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "var(--r-full)" }}>New — not saved</div>
                    <button onClick={() => { setHeroImageFile(null); setHeroImagePreview(""); }} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><LuX size={14} /></button>
                  </div>
                )}
                <div onClick={() => heroFileInputRef.current?.click()} onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) { setHeroImageFile(f); setHeroImagePreview(URL.createObjectURL(f)); } }}
                  style={{ border: "2px dashed var(--border)", borderRadius: "var(--r-lg)", padding: "1.5rem", textAlign: "center", cursor: "pointer", background: "var(--ash-pale)" }}>
                  <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-muted)" }}>Drop photo here or <span style={{ color: "var(--red)", fontWeight: 700 }}>browse</span></p>
                  <p style={{ fontSize: "0.75rem", color: "var(--ash)", marginTop: "0.25rem" }}>JPG · PNG · WEBP · max 5 MB</p>
                </div>
                <input ref={heroFileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setHeroImageFile(f); setHeroImagePreview(URL.createObjectURL(f)); } }} />
                {heroImageProgress !== null && (
                  <div style={{ marginTop: "1rem", height: 6, background: "var(--ash-light)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${heroImageProgress}%`, background: "var(--red)", borderRadius: 3, transition: "width 0.2s" }} />
                  </div>
                )}
                {heroImageFile && (
                  <button onClick={saveHeroImage} disabled={savingHero} className={styles.btn} style={{ marginTop: "1rem", width: "100%" }}>
                    {savingHero ? `Uploading ${heroImageProgress ?? 0}%…` : "Save Hero Image"}
                  </button>
                )}
              </div>

              {/* Brand text */}
              <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem" }}>
                <p style={{ fontWeight: 800, marginBottom: "0.375rem" }}>Restaurant Name & Tagline</p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "1.25rem" }}>Shown in the hero of the customer menu.</p>
                <div className={styles.formGroup}>
                  <label>Restaurant Name</label>
                  <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="e.g. Kyekye Cuisine" maxLength={40} />
                </div>
                <div className={styles.formGroup}>
                  <label>Tagline / Subline</label>
                  <input type="text" value={brandTagline} onChange={e => setBrandTagline(e.target.value)} placeholder="e.g. Fresh · Authentic · Delicious" maxLength={60} />
                </div>

                {/* Live preview */}
                <div style={{ background: "var(--black)", borderRadius: "var(--r-lg)", padding: "1.25rem 1.5rem", marginBottom: "1.25rem" }}>
                  <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "0.25rem" }}>Authentic Ghanaian Cuisine</p>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-1.5px", color: "var(--white)", lineHeight: 1, marginBottom: "0.3rem" }}>
                    {brandName || "Restaurant Name"}<span style={{ color: brandColor }}>.</span>
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>{brandTagline || "Your tagline here"}</p>
                </div>

                <button className={styles.btn} style={{ width: "100%" }} onClick={saveBranding} disabled={savingBrand}>
                  {savingBrand ? "Saving…" : "Save Changes"}
                </button>
              </div>

              {/* Accent colour */}
              <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem" }}>
                <p style={{ fontWeight: 800, marginBottom: "0.375rem" }}>Accent Colour</p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "1.25rem" }}>Used for prices, buttons and badges on the customer menu.</p>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                  <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)}
                    style={{ width: 56, height: 56, borderRadius: "var(--r-md)", border: "1.5px solid var(--border)", cursor: "pointer", padding: 2 }} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: "0.9375rem" }}>{brandColor.toUpperCase()}</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Current accent colour</p>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.25rem" }}>
                  {["#D32F2F","#C62828","#E65100","#2E7D32","#1565C0","#6A1B9A","#F57F17","#111111"].map(c => (
                    <button key={c} onClick={() => setBrandColor(c)}
                      style={{ width: 32, height: 32, borderRadius: "var(--r-sm)", background: c, border: brandColor === c ? "3px solid var(--black)" : "2px solid transparent", cursor: "pointer", transition: "transform 0.1s" }} />
                  ))}
                </div>

                {/* Preview pill */}
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", padding: "1rem", background: "var(--ash-pale)", borderRadius: "var(--r-lg)" }}>
                  <span style={{ fontWeight: 800, fontSize: "1.1rem", color: brandColor }}>₵12.00</span>
                  <button style={{ background: brandColor, color: "white", border: "none", borderRadius: "var(--r-full)", width: 32, height: 32, fontWeight: 800, fontSize: "1.1rem", cursor: "default", boxShadow: `0 4px 12px ${brandColor}55` }}>+</button>
                  <span style={{ background: brandColor, color: "white", fontSize: "0.65rem", fontWeight: 800, padding: "0.2rem 0.5rem", borderRadius: "var(--r-full)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><LuFlame size={10} /> Popular</span>
                </div>

                <button className={styles.btn} style={{ width: "100%", marginTop: "1.25rem" }} onClick={saveBranding} disabled={savingBrand}>
                  {savingBrand ? "Saving…" : "Save Colour"}
                </button>
              </div>

              {/* Services toggle */}
              <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem" }}>
                <p style={{ fontWeight: 800, marginBottom: "0.375rem" }}>Order Channels</p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "1.25rem" }}>Control which order types appear on the customer menu.</p>
                {[
                  { key: "enableDineIn", label: "Dine In", Icon: LuUtensils, desc: "Customers order from their table" },
                  { key: "enablePickup", label: "Pickup", Icon: LuShoppingBag, desc: "Customer collects from counter" },
                  { key: "enableDelivery", label: "Delivery", Icon: LuBike, desc: "Delivered to customer address" },
                ].map(ch => (
                  <div key={ch.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ color: "var(--text-muted)" }}><ch.Icon size={20} strokeWidth={1.5} /></span>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>{ch.label}</p>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{ch.desc}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>Always on</span>
                  </div>
                ))}
                <p style={{ fontSize: "0.75rem", color: "var(--ash)", marginTop: "1rem", lineHeight: 1.5 }}>
                  All three channels are active. Per-channel toggles coming in a future update.
                </p>
              </div>
            </div>
          </div>

          {/* ── ANALYTICS ── */}
          <div id="analytics-section">
            <SectionTitle>Analytics</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem" }}>
                <p style={{ fontWeight: 800, marginBottom: "1rem" }}>7-Day Revenue</p>
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueData}>
                      <XAxis dataKey="name" stroke="#888" fontSize={12} />
                      <YAxis stroke="#888" fontSize={12} />
                      <Tooltip cursor={{ fill: "rgba(211,47,47,0.05)" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                      <Bar dataKey="revenue" fill="var(--red)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
                <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem" }}>
                  <p style={{ fontWeight: 800, marginBottom: "1rem" }}>Top Selling Items (All Time)</p>
                  {topItems.length === 0 ? <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No data yet.</p> :
                    topItems.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontSize: "0.9rem" }}><span style={{ color: COLORS[idx % COLORS.length], marginRight: "0.5rem" }}>●</span>{item.name}</span>
                        <span style={{ fontWeight: 800, fontSize: "0.9rem" }}>{item.value} sold</span>
                      </div>
                    ))
                  }
                </div>
                <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem" }}>
                  <p style={{ fontWeight: 800, marginBottom: "1rem" }}>Peak Hours</p>
                  {peakHours.length === 0 ? <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No data yet.</p> :
                    peakHours.map((ph, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ width: "28px", height: "28px", background: idx === 0 ? "var(--red)" : "var(--ash-pale)", color: idx === 0 ? "white" : "var(--text-muted)", borderRadius: "var(--r-full)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.75rem", flexShrink: 0 }}>#{idx + 1}</span>
                        <span style={{ fontWeight: 700, fontSize: "0.9375rem" }}>{ph.time}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginLeft: "auto" }}>{ph.orders} orders</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>

          {/* ── SHIFT REPORT ── */}
          <div id="report-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
              <SectionTitle>Daily Shift Report</SectionTitle>
              <button className={styles.btn} onClick={printShiftReport} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><LuPrinter size={15} /> Print / Export PDF</button>
            </div>
            <div className={styles.statsGrid} style={{ marginBottom: "1.5rem" }}>
              <div className={styles.statCard}><h3>Revenue</h3><div className={styles.statValue} style={{ color: "var(--red)" }}>₵{todaysSales.toFixed(2)}</div></div>
              <div className={styles.statCard}><h3>Orders</h3><div className={styles.statValue}>{todaysOrders}</div></div>
              <div className={styles.statCard}><h3>Avg. Order</h3><div className={styles.statValue}>₵{todaysOrders > 0 ? (todaysSales / todaysOrders).toFixed(2) : "0.00"}</div></div>
            </div>
            <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
              {allOrdersToday.length === 0
                ? <p style={{ padding: "1.5rem", color: "var(--text-muted)" }}>No orders today yet.</p>
                : allOrdersToday.map((order: any, idx: number) => (
                  <div key={order.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 1.25rem", borderBottom: idx < allOrdersToday.length - 1 ? "1px solid var(--border)" : "none", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.2rem" }}>
                        <span style={{ fontWeight: 700 }}>{order.tableNumber}</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>#{order.id.slice(0, 5).toUpperCase()}</span>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {order.items?.map((i: any) => `${i.quantity || i.qty || 1}× ${i.name}`).join(", ")}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.625rem", alignItems: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, background: order.paymentStatus === "paid_online" ? "#E3F2FD" : "var(--ash-pale)", color: order.paymentStatus === "paid_online" ? "#1565C0" : "var(--text-muted)", padding: "0.2rem 0.5rem", borderRadius: "var(--r-full)" }}>
                        {order.paymentStatus === "paid_online" ? <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><LuCreditCard size={11} /> Card</span> : <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><LuBanknote size={11} /> Cash</span>}
                      </span>
                      <span style={{ fontWeight: 800, color: "var(--red)" }}>₵{Number(order.total || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}
