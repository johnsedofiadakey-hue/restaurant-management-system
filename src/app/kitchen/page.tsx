"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import styles from "./page.module.css";
import { useAuth } from "../../lib/authContext";
import { auth, db } from "../../lib/firebase";
import { collection, onSnapshot, updateDoc, doc, query, orderBy, where, getDocs } from "firebase/firestore";
import { useToast } from "../../components/Toast";
import { LuCheck, LuBike, LuShoppingBag, LuMapPin, LuTriangleAlert } from "react-icons/lu";
import DashboardNav from "../../components/DashboardNav";

const TimeAgo = ({ timestamp }: { timestamp: any }) => {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    if (!timestamp?.toMillis) return;
    const calc = () => setMins(Math.floor((Date.now() - timestamp.toMillis()) / 60000));
    calc();
    const int = setInterval(calc, 30000);
    return () => clearInterval(int);
  }, [timestamp]);

  if (mins < 1) return <span style={{ fontSize: "0.8rem", color: "var(--ash)" }}>Just now</span>;
  return (
    <span style={{ fontSize: "0.8rem", color: mins >= 15 ? "var(--red-deep)" : "var(--ash)", fontWeight: mins >= 15 ? 800 : "normal", background: mins >= 15 ? "var(--red-light)" : "transparent", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>
      ⏱ {mins}m ago
    </span>
  );
};

export default function KitchenDashboard() {
  const [activeTab, setActiveTab] = useState("queue");
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [previousOrderCount, setPreviousOrderCount] = useState(0);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const notify = (title: string, body: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  };

  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("timestamp", "asc"));
    const unsubOrders = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubMenu = onSnapshot(collection(db, "menu"), (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubOrders(); unsubMenu(); };
  }, []);

  const updateOrderStatus = async (id: string, newStatus: string, tableNumber?: string) => {
    await updateDoc(doc(db, "orders", id), { status: newStatus, updatedAt: Date.now() });

    // When an order is marked complete, free the table
    if (newStatus === "completed" && tableNumber) {
      const tablesSnap = await getDocs(query(collection(db, "tables"), where("name", "==", tableNumber)));
      tablesSnap.forEach(async (tableDoc) => {
        await updateDoc(doc(db, "tables", tableDoc.id), { status: "available", assignedWaiterId: null });
      });
      toast(`Order served — ${tableNumber} is now available.`, "success");
    }
  };

  const toggleItemComplete = async (orderId: string, itemIdx: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order?.items) return;
    const newItems = [...order.items];
    newItems[itemIdx] = { ...newItems[itemIdx], completed: !newItems[itemIdx].completed };
    await updateDoc(doc(db, "orders", orderId), { items: newItems });
  };

  const updateOrderEta = async (id: string, eta: string) => {
    await updateDoc(doc(db, "orders", id), { eta });
  };

  const toggleStock = async (id: string, currentStock: boolean) => {
    await updateDoc(doc(db, "menu", id), { inStock: !currentStock });
    toast(`Item marked ${!currentStock ? "in stock" : "out of stock"}.`, !currentStock ? "success" : "warning");
  };

  const newOrders = orders.filter(o => o.status === "received");
  const preparingOrders = orders.filter(o => o.status === "preparing");
  const readyOrders = orders.filter(o => o.status === "ready");

  // Audio alert on new order
  useEffect(() => {
    if (newOrders.length > previousOrderCount && previousOrderCount !== 0) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } catch {}
      toast("New order received!", "info");
      notify("🍽 New Order", `${newOrders.length} order${newOrders.length > 1 ? "s" : ""} waiting — check the queue.`);
    }
    setPreviousOrderCount(newOrders.length);
  }, [newOrders.length, previousOrderCount]);

  const renderItems = (order: any) =>
    order.items?.map((item: any, idx: number) => (
      <div key={`${item.id || item.menuItemId}-${idx}`} className={styles.orderItem} onClick={() => toggleItemComplete(order.id, idx)}
        style={{ cursor: "pointer", textDecoration: item.completed ? "line-through" : "none", color: item.completed ? "#aaa" : "inherit", opacity: item.completed ? 0.6 : 1, transition: "all 0.2s" }}>
        <span>{(item.quantity || item.qty || 1)}x {item.name} {item.completed && <LuCheck size={14} strokeWidth={2.5} style={{ verticalAlign: "middle", color: "#4CAF50" }} />}</span>
      </div>
    ));

  const etaSelect = (order: any) => (
    <select value={order.eta || ""} onChange={e => updateOrderEta(order.id, e.target.value)}
      style={{ padding: "0.3rem", borderRadius: "4px", fontSize: "0.85rem", width: "100%", margin: "0.5rem 0" }}>
      <option value="">Set ETA...</option>
      <option value="~5 mins">~5 mins</option>
      <option value="10-15 mins">10-15 mins</option>
      <option value="20-30 mins">20-30 mins</option>
      <option value="45+ mins">45+ mins</option>
    </select>
  );

  return (
    <ProtectedRoute allowedRoles={["admin", "supervisor", "kitchen"]}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Kitchen Display System (KDS)</h1>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <DashboardNav current="/kitchen" />
            <button className={styles.btn} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white" }} onClick={() => window.location.href = "/settings"}>Settings</button>
            <button className={styles.btn} onClick={() => auth.signOut()}>Sign Out</button>
          </div>
        </header>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${activeTab === "queue" ? styles.active : ""}`} onClick={() => setActiveTab("queue")}>Order Queue</button>
          <button className={`${styles.tab} ${activeTab === "inventory" ? styles.active : ""}`} onClick={() => setActiveTab("inventory")}>Inventory & Recipes</button>
        </div>

        {activeTab === "queue" && (
          <div className={styles.kanbanBoard}>
            {/* New Orders */}
            <div className={styles.kanbanColumn}>
              <div className={styles.columnTitle}>
                <span>New Orders</span>
                <span style={{ background: "var(--primary)", color: "white", padding: "0 8px", borderRadius: "12px", fontSize: "0.9rem" }}>{newOrders.length}</span>
              </div>
              {newOrders.map(order => (
                <div key={order.id} className={styles.orderCard} style={{ borderColor: order.timestamp?.toMillis && (Date.now() - order.timestamp.toMillis()) > 15 * 60000 ? "var(--red-deep)" : "var(--border)" }}>
                  <div className={styles.orderHeader}>
                    <div>
                      <span className={styles.tableNumber}>{order.tableNumber}</span>
                      {order.orderType && order.orderType !== "dine_in" && (
                        <span style={{ marginLeft: "0.5rem", fontSize: "0.65rem", fontWeight: 800, padding: "0.15rem 0.5rem", borderRadius: "4px", background: order.orderType === "delivery" ? "#EFF6FF" : "#FFF8E1", color: order.orderType === "delivery" ? "#1D4ED8" : "#B45309", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>{order.orderType === "delivery" ? <><LuBike size={11} /> Delivery</> : <><LuShoppingBag size={11} /> Pickup</>}</span>
                        </span>
                      )}
                    </div>
                    <TimeAgo timestamp={order.timestamp} />
                  </div>
                  {order.deliveryAddress && (
                    <div style={{ fontSize: "0.8rem", color: "#1D4ED8", fontWeight: 600, marginBottom: "0.375rem", background: "#EFF6FF", padding: "0.375rem 0.5rem", borderRadius: "4px", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <LuMapPin size={12} /> {order.deliveryAddress}
                    </div>
                  )}
                  {renderItems(order)}
                  {order.instructions && (
                    <div style={{ background: "var(--red-light)", color: "var(--red-deep)", padding: "0.5rem", borderRadius: "4px", fontSize: "0.9rem", marginTop: "0.5rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.375rem" }}><LuTriangleAlert size={14} /> {order.instructions}</div>
                  )}
                  {etaSelect(order)}
                  <div className={styles.cardActions}>
                    <button className={`${styles.actionBtn} ${styles.primary}`} onClick={() => updateOrderStatus(order.id, "preparing")}>Start Preparing</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Preparing */}
            <div className={styles.kanbanColumn}>
              <div className={styles.columnTitle}>
                <span>Preparing</span>
                <span style={{ background: "#ffb300", color: "white", padding: "0 8px", borderRadius: "12px", fontSize: "0.9rem" }}>{preparingOrders.length}</span>
              </div>
              {preparingOrders.map(order => (
                <div key={order.id} className={styles.orderCard} style={{ borderLeftColor: "#ffb300" }}>
                  <div className={styles.orderHeader}>
                    <span className={styles.tableNumber}>{order.tableNumber}</span>
                    <TimeAgo timestamp={order.timestamp} />
                  </div>
                  {renderItems(order)}
                  {etaSelect(order)}
                  <div className={styles.cardActions}>
                    <button className={styles.actionBtn} onClick={() => updateOrderStatus(order.id, "received")}>Revert</button>
                    <button className={`${styles.actionBtn} ${styles.primary}`} style={{ background: "#4caf50" }} onClick={() => updateOrderStatus(order.id, "ready")}>Mark Ready</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Ready */}
            <div className={styles.kanbanColumn}>
              <div className={styles.columnTitle}>
                <span>Ready / Waiting</span>
                <span style={{ background: "#4caf50", color: "white", padding: "0 8px", borderRadius: "12px", fontSize: "0.9rem" }}>{readyOrders.length}</span>
              </div>
              {readyOrders.length === 0 && <p style={{ color: "#666", textAlign: "center", marginTop: "2rem" }}>No orders waiting to be served.</p>}
              {readyOrders.map(order => (
                <div key={order.id} className={styles.orderCard} style={{ borderLeftColor: "#4caf50" }}>
                  <div className={styles.orderHeader}>
                    <span className={styles.tableNumber}>{order.tableNumber}</span>
                    <TimeAgo timestamp={order.timestamp} />
                  </div>
                  {renderItems(order)}
                  <div className={styles.cardActions}>
                    <button className={styles.actionBtn} onClick={() => updateOrderStatus(order.id, "preparing")}>Revert</button>
                    <button className={`${styles.actionBtn} ${styles.primary}`} style={{ background: "var(--text)" }}
                      onClick={() => updateOrderStatus(order.id, "completed", order.tableNumber)}>
                      Served ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "inventory" && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Inventory Control (Live)</h2>
            <p style={{ marginBottom: "2rem", color: "#666" }}>Toggle items here. Out-of-stock items instantly vanish from the customer menu.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {menuItems.map(item => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface)", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
                  <div>
                    <h3 style={{ fontWeight: "bold", color: item.inStock !== false ? "var(--text)" : "#999" }}>{item.name}</h3>
                    <p style={{ color: "#666", fontSize: "0.9rem" }}>Category: {item.category}</p>
                  </div>
                  <button onClick={() => toggleStock(item.id, item.inStock !== false)}
                    style={{ background: item.inStock !== false ? "#4caf50" : "#ff5252", color: "white", padding: "0.75rem 1.5rem", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700 }}>
                    {item.inStock !== false ? "In Stock" : "Out of Stock (86'd)"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </ProtectedRoute>
  );
}
