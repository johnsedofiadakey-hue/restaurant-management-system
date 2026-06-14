"use client";

import { useState, useEffect, useRef } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import styles from "./page.module.css";
import { useAuth } from "../../lib/authContext";
import { auth, db } from "../../lib/firebase";
import { collection, onSnapshot, query, orderBy, updateDoc, doc, addDoc, serverTimestamp } from "firebase/firestore";
import { useToast } from "../../components/Toast";
import DashboardNav from "../../components/DashboardNav";
import { LuReceipt, LuConciergeBell, LuBell, LuBike, LuShoppingBag, LuCreditCard, LuBanknote, LuMapPin, LuCheck, LuTriangleAlert, LuPrinter, LuArmchair } from "react-icons/lu";

export default function WaiterDashboard() {
  const [activeTab, setActiveTab] = useState("tables");
  const { user } = useAuth();
  const { toast } = useToast();

  const [orders, setOrders] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [printTarget, setPrintTarget] = useState<any | null>(null);

  const [manualTable, setManualTable] = useState("");
  const [manualItem, setManualItem] = useState("");
  const [manualQty, setManualQty] = useState(1);
  const [manualNote, setManualNote] = useState("");
  const [loading, setLoading] = useState(false);

  const prevAlertCount = useRef(0);

  // ── Push notification permission ──────────────────────────────
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const notify = (title: string, body: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/manifest.json" });
    }
  };

  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("timestamp", "desc"));
    const unsubOrders = onSnapshot(q, snap =>
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const unsubMenu = onSnapshot(collection(db, "menu"), snap =>
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((m: any) => m.inStock !== false)));

    const unsubTables = onSnapshot(collection(db, "tables"), snap =>
      setTables(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const unsubAlerts = onSnapshot(query(collection(db, "alerts"), orderBy("timestamp", "desc")), snap => {
      const active = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => a.active);
      if (active.length > prevAlertCount.current) {
        const newest = active[0] as any;
        notify(
          newest.type === "bill" ? "Bill Requested" : "Waiter Called",
          `${newest.table} needs attention`
        );
      }
      prevAlertCount.current = active.length;
      setAlerts(active);
    });

    return () => { unsubOrders(); unsubMenu(); unsubTables(); unsubAlerts(); };
  }, []);

  const activeOrders = orders.filter(o => !["completed", "cancelled"].includes(o.status));
  const readyOrders = orders.filter(o => o.status === "ready");

  const serveFood = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), { status: "served", updatedAt: Date.now() });
    toast("Marked as served.", "success");
  };

  const closeTab = async (tableOrders: any[]) => {
    if (!confirm("Mark all orders for this table as paid and complete?")) return;
    for (const o of tableOrders) {
      await updateDoc(doc(db, "orders", o.id), { status: "completed", updatedAt: Date.now() });
    }
    toast("Tab closed — table is now free.", "success");
  };

  const dismissAlert = async (id: string) => {
    await updateDoc(doc(db, "alerts", id), { active: false });
    toast("Alert resolved.", "info");
  };

  const submitManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTable || !manualItem) return toast("Please select a table and item.", "warning");
    setLoading(true);
    const item = menuItems.find(m => m.id === manualItem);
    await addDoc(collection(db, "orders"), {
      tableNumber: manualTable,
      items: [{ menuItemId: item.id, name: item.name, price: item.price, quantity: manualQty, specialInstructions: manualNote, status: "received" }],
      total: item.price * manualQty,
      status: "received",
      paymentMethod: "cash",
      paymentStatus: "unpaid",
      instructions: manualNote,
      isManual: true,
      timestamp: serverTimestamp(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    toast("Order sent to kitchen!", "success");
    setLoading(false);
    setManualQty(1);
    setManualNote("");
    setManualItem("");
  };

  // ── Receipt printing ──────────────────────────────────────────
  const esc = (s: any) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

  const printBill = (tableGroup: any) => {
    const now = new Date().toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" });
    const items = tableGroup.orders.flatMap((o: any) => o.items || []);
    const hasPaid = tableGroup.orders.some((o: any) => o.paymentStatus === "paid_online");

    const rows = items.map((item: any) =>
      `<tr>
        <td>${esc(item.name)}${item.specialInstructions ? `<br><small style="color:#888">${esc(item.specialInstructions)}</small>` : ""}</td>
        <td style="text-align:center">${Number(item.quantity || item.qty || 1)}</td>
        <td style="text-align:right">₵${Number(item.price).toFixed(2)}</td>
        <td style="text-align:right">₵${(Number(item.price) * (item.quantity || item.qty || 1)).toFixed(2)}</td>
      </tr>`
    ).join("");

    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Receipt — ${tableGroup.tableNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; font-size: 13px; padding: 20px; max-width: 320px; margin: 0 auto; color: #111; }
          .brand { text-align: center; margin-bottom: 12px; }
          .brand h1 { font-size: 22px; font-weight: 900; letter-spacing: -1px; }
          .brand p { font-size: 11px; color: #666; }
          .divider { border: none; border-top: 1px dashed #bbb; margin: 10px 0; }
          .meta { font-size: 11px; color: #555; margin-bottom: 10px; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; }
          th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; padding: 4px 0; border-bottom: 1px solid #ddd; }
          td { padding: 5px 0; vertical-align: top; line-height: 1.4; }
          td small { font-size: 10px; }
          .total-row td { font-weight: 900; font-size: 15px; padding-top: 8px; border-top: 1px dashed #bbb; }
          .status { text-align: center; margin-top: 12px; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 4px; display: inline-block; }
          .paid { background: #e8f5e9; color: #2e7d32; }
          .unpaid { background: #fff3e0; color: #e65100; }
          .footer { text-align: center; font-size: 10px; color: #aaa; margin-top: 16px; line-height: 1.8; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="brand">
          <h1>Kyekye Cuisine</h1>
          <p>Thank you for dining with us</p>
        </div>
        <hr class="divider"/>
        <div class="meta">
          <strong>Table:</strong> ${esc(tableGroup.tableNumber)}<br/>
          <strong>Date:</strong> ${now}<br/>
          <strong>Server:</strong> Kyekye POS
        </div>
        <hr class="divider"/>
        <table>
          <thead>
            <tr>
              <th style="text-align:left">Item</th>
              <th style="text-align:center">Qty</th>
              <th style="text-align:right">Unit</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="3">TOTAL</td>
              <td style="text-align:right">₵${tableGroup.grandTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <div style="text-align:center;margin-top:10px">
          <span class="status ${hasPaid ? "paid" : "unpaid"}">${hasPaid ? "✓ PAID (Mobile Money / Card)" : "CASH / POS DUE"}</span>
        </div>
        <div class="footer">
          Kyekye Cuisine · kyekyecuisine.web.app<br/>
          Powered by Kyekye POS
        </div>
        <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
      </body>
      </html>
    `);
    win.document.close();
  };

  // ── Group active orders by table ──────────────────────────────
  const tablesMap = new Map<string, any>();
  activeOrders.forEach(order => {
    if (!tablesMap.has(order.tableNumber)) {
      tablesMap.set(order.tableNumber, { tableNumber: order.tableNumber, orders: [], grandTotal: 0, hasReady: false });
    }
    const t = tablesMap.get(order.tableNumber);
    t.orders.push(order);
    t.grandTotal += order.total || 0;
    if (order.status === "ready") t.hasReady = true;
  });
  const groupedTables = Array.from(tablesMap.values());

  return (
    <ProtectedRoute allowedRoles={["admin", "supervisor", "waiter"]}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Waiter Dashboard</h1>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <DashboardNav current="/waiter" />
            <button className={styles.btn} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white" }} onClick={() => window.location.href = "/settings"}>Settings</button>
            <button className={styles.btn} onClick={() => auth.signOut()}>Sign Out</button>
          </div>
        </header>

        {/* ── Alerts ── */}
        {alerts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "1rem 1.5rem 0" }}>
            {alerts.map((a: any) => (
              <div key={a.id} style={{ background: a.type === "bill" ? "var(--red-light)" : "#FFF8E1", border: `2px solid ${a.type === "bill" ? "var(--red)" : "#F59E0B"}`, padding: "0.875rem 1.25rem", borderRadius: "var(--r-md)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                <span style={{ fontWeight: 800, color: a.type === "bill" ? "var(--red)" : "#B45309", fontSize: "0.9375rem" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>{a.type === "bill" ? <LuReceipt size={15} /> : <LuConciergeBell size={15} />}{a.type === "bill" ? "Bill Requested —" : "Waiter Called —"}</span> <strong>{a.table}</strong>
                </span>
                <button onClick={() => dismissAlert(a.id)} style={{ background: "var(--black)", color: "white", border: "none", padding: "0.4rem 0.875rem", borderRadius: "var(--r-sm)", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem", flexShrink: 0 }}>Resolve</button>
              </div>
            ))}
          </div>
        )}

        {readyOrders.length > 0 && (
          <div className={styles.alertsBanner} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <LuBell size={15} /> {readyOrders.length} order{readyOrders.length > 1 ? "s" : ""} ready from the kitchen!
          </div>
        )}

        {/* ── Tabs ── */}
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${activeTab === "tables" ? styles.active : ""}`} onClick={() => setActiveTab("tables")}>Active Tables</button>
          <button className={`${styles.tab} ${activeTab === "floor" ? styles.active : ""}`} onClick={() => setActiveTab("floor")}>
            Floor View
            {readyOrders.length > 0 && <span style={{ marginLeft: "0.4rem", background: "var(--red)", color: "white", borderRadius: "var(--r-full)", padding: "0 6px", fontSize: "0.7rem", fontWeight: 800 }}>{readyOrders.length}</span>}
          </button>
          <button className={`${styles.tab} ${activeTab === "manual_order" ? styles.active : ""}`} onClick={() => setActiveTab("manual_order")}>Manual Order</button>
        </div>

        {/* ── TABLE CARDS ── */}
        {activeTab === "tables" && (
          <div className={styles.tableGrid} style={{ padding: "1.5rem" }}>
            {groupedTables.length === 0 && (
              <p style={{ color: "var(--text-muted)", padding: "2rem 0" }}>No active tables right now.</p>
            )}
            {groupedTables.map(t => (
              <div key={t.tableNumber} className={styles.tableCard} style={{ borderColor: t.hasReady ? "#4CAF50" : "var(--border)", borderWidth: t.hasReady ? "2px" : "1px" }}>
                <div className={styles.tableHeader}>
                  <h3 style={{ fontSize: "1.375rem", fontWeight: 900, letterSpacing: "-0.02em" }}>{t.tableNumber}</h3>
                  {t.hasReady && <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "#E8F5E9", color: "#2E7D32", padding: "0.2rem 0.625rem", borderRadius: "var(--r-full)", letterSpacing: "0.04em" }}>READY</span>}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", margin: "0.75rem 0" }}>
                  {t.orders.map((order: any) => (
                    <div key={order.id} style={{ background: "var(--ash-pale)", padding: "0.75rem", borderRadius: "var(--r-md)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.03em" }}>
                          #{order.id.slice(0, 5).toUpperCase()}
                          {order.eta && <span style={{ marginLeft: "0.5rem", color: "var(--red)" }}>({order.eta})</span>}
                          {order.orderType === "delivery" && <span style={{ marginLeft: "0.5rem", background: "#EFF6FF", color: "#1D4ED8", padding: "0.1rem 0.4rem", borderRadius: "3px", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><LuBike size={10} /> Delivery</span>}
                          {order.orderType === "pickup" && <span style={{ marginLeft: "0.5rem", background: "#FFF8E1", color: "#B45309", padding: "0.1rem 0.4rem", borderRadius: "3px", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><LuShoppingBag size={10} /> Pickup</span>}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          {order.paymentStatus === "paid_online"
                            ? <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "#E3F2FD", color: "#1565C0", padding: "0.15rem 0.5rem", borderRadius: "var(--r-full)", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}><LuCreditCard size={10} /> PAID</span>
                            : <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "var(--ash-light)", color: "var(--text-muted)", padding: "0.15rem 0.5rem", borderRadius: "var(--r-full)", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}><LuBanknote size={10} /> CASH</span>
                          }
                          <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "var(--r-full)", background: order.status === "ready" ? "#E8F5E9" : order.status === "preparing" ? "#FFF8E1" : "var(--ash-light)", color: order.status === "ready" ? "#2E7D32" : order.status === "preparing" ? "#E65100" : "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                      {order.deliveryAddress && (
                        <div style={{ fontSize: "0.75rem", color: "#1D4ED8", fontWeight: 600, background: "#EFF6FF", padding: "0.25rem 0.5rem", borderRadius: "4px", marginBottom: "0.375rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <LuMapPin size={11} /> {order.deliveryAddress}
                          {order.customerPhone && <span style={{ marginLeft: "0.5rem", color: "#1565C0" }}>· {order.customerPhone}</span>}
                        </div>
                      )}
                      {order.items?.map((item: any, idx: number) => (
                        <div key={idx} style={{ fontSize: "0.875rem", color: "var(--text)", lineHeight: 1.5 }}>
                          {item.quantity || item.qty || 1}× {item.name}
                          {item.specialInstructions && <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}> — {item.specialInstructions}</span>}
                        </div>
                      ))}
                      {order.status === "ready" && (
                        <button onClick={() => serveFood(order.id)} style={{ marginTop: "0.625rem", width: "100%", background: "#4CAF50", color: "white", border: "none", padding: "0.5rem", borderRadius: "var(--r-sm)", cursor: "pointer", fontWeight: 700, fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem" }}>
                          <LuCheck size={14} strokeWidth={2.5} /> Mark as Served
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: "1px dashed var(--border)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Tab Total</span>
                    <span style={{ fontSize: "1.375rem", fontWeight: 900, color: "var(--red)", letterSpacing: "-0.02em" }}>₵{t.grandTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => printBill(t)} style={{ flex: 1, padding: "0.625rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--border)", background: "transparent", color: "var(--text)", fontWeight: 700, fontSize: "0.8125rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem" }}>
                      <LuPrinter size={14} /> Print Bill
                    </button>
                    <button onClick={() => closeTab(t.orders)} style={{ flex: 2, padding: "0.625rem", borderRadius: "var(--r-sm)", border: "none", background: "var(--black)", color: "white", fontWeight: 700, fontSize: "0.8125rem", cursor: "pointer" }}>
                      Close Tab (Paid)
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── FLOOR VIEW ── */}
        {activeTab === "floor" && (
          <section style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 800, letterSpacing: "-0.02em" }}>Floor View</h2>
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", fontWeight: 700 }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4CAF50", display: "inline-block" }} />Free</span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#F59E0B", display: "inline-block" }} />Occupied</span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--red)", display: "inline-block" }} />Alert / Ready</span>
              </div>
            </div>

            {tables.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                <div style={{ marginBottom: "1rem", opacity: 0.4, display: "flex", justifyContent: "center" }}><LuArmchair size={40} strokeWidth={1} /></div>
                <p style={{ fontWeight: 700 }}>No tables set up yet</p>
                <p style={{ fontSize: "0.875rem", marginTop: "0.35rem" }}>Ask an admin to add tables in the Admin panel.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "1rem" }}>
                {tables.map(t => {
                  const tableOrders = activeOrders.filter(o => o.tableNumber === t.name);
                  const hasAlert = alerts.some(a => a.table === t.name);
                  const hasReady = tableOrders.some(o => o.status === "ready");
                  const isOccupied = tableOrders.length > 0;
                  const bg = (hasAlert || hasReady) ? "var(--red)" : isOccupied ? "#F59E0B" : "#4CAF50";
                  const total = tableOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
                  return (
                    <div key={t.id}
                      onClick={() => isOccupied && setActiveTab("tables")}
                      style={{ background: "var(--white)", border: `2px solid ${bg}`, borderRadius: "var(--r-lg)", padding: "1rem", cursor: isOccupied ? "pointer" : "default", transition: "transform 0.15s, box-shadow 0.15s", boxShadow: (hasAlert || hasReady) ? `0 0 0 4px ${bg}22` : "var(--shadow-xs)", animation: (hasAlert || hasReady) ? "pulse-ring 2s infinite" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.625rem" }}>
                        <span style={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>{t.name}</span>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: bg, display: "inline-block", flexShrink: 0, marginTop: 3 }} />
                      </div>
                      {t.seats && <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: "0.375rem" }}>{t.seats} seats</p>}
                      {isOccupied ? (
                        <>
                          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: (hasAlert || hasReady) ? "var(--red)" : "#B45309" }}>
                            {hasAlert ? <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><LuTriangleAlert size={12} /> Alert!</span> : hasReady ? <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><LuCheck size={12} strokeWidth={2.5} /> Food Ready</span> : `${tableOrders.length} order${tableOrders.length > 1 ? "s" : ""}`}
                          </p>
                          <p style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text)", marginTop: "0.25rem" }}>₵{total.toFixed(2)}</p>
                        </>
                      ) : (
                        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#4CAF50" }}>Available</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── MANUAL ORDER ── */}
        {activeTab === "manual_order" && (
          <section className={styles.section} style={{ padding: "1.5rem", maxWidth: "560px" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 800, marginBottom: "1.5rem", letterSpacing: "-0.02em" }}>Punch In Manual Order</h2>
            <form onSubmit={submitManualOrder}>
              <div className={styles.formGroup}>
                <label>Table</label>
                <select value={manualTable} onChange={e => setManualTable(e.target.value)} required>
                  <option value="">Select table…</option>
                  <option value="Pickup">Pickup / Walk-in</option>
                  {tables.map(t => <option key={t.id} value={t.name}>{t.name}{t.seats ? ` (${t.seats} seats)` : ""}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Item</label>
                <select value={manualItem} onChange={e => setManualItem(e.target.value)} required>
                  <option value="">Select item…</option>
                  {menuItems.map(m => <option key={m.id} value={m.id}>{m.name} — ₵{Number(m.price).toFixed(2)}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Quantity</label>
                <input type="number" value={manualQty} onChange={e => setManualQty(Number(e.target.value))} min="1" required />
              </div>
              <div className={styles.formGroup}>
                <label>Special Instructions <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span></label>
                <input type="text" value={manualNote} onChange={e => setManualNote(e.target.value)} placeholder="e.g. No pepper, extra sauce" />
              </div>
              <button type="submit" className={styles.btn} disabled={loading}>
                {loading ? "Sending…" : "Send to Kitchen"}
              </button>
            </form>
          </section>
        )}
      </div>
    </ProtectedRoute>
  );
}
