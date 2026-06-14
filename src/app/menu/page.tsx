"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import "./tracking.css";
import { db } from "../../lib/firebase";
import { collection, addDoc, doc, onSnapshot, serverTimestamp, updateDoc, getDoc } from "firebase/firestore";
import { useToast } from "../../components/Toast";
import type { MenuItem, Table, Order, OrderItem } from "../../lib/models";
import {
  LuUtensils, LuUtensilsCrossed, LuShoppingBag, LuBike, LuMapPin,
  LuTriangleAlert, LuCheck, LuX, LuStar, LuFlame, LuBanknote,
  LuCreditCard, LuConciergeBell, LuReceipt, LuPartyPopper, LuWifiOff,
} from "react-icons/lu";

declare global {
  interface Window {
    PaystackPop: {
      setup: (opts: {
        key: string; email: string; amount: number; currency: string;
        ref: string; onClose: () => void; callback: (response: { reference: string }) => void;
      }) => { openIframe: () => void };
    };
  }
}

type CartItem = { id: string; name: string; price: number; qty: number; note: string; img?: string; addOns?: any[] };

function CustomerApp() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [navTab, setNavTab] = useState<"menu" | "orders">("menu");
  const [activeCategory, setActiveCategory] = useState("All");
  const [cartOpen, setCartOpen] = useState(false);

  const [menuItems, setMenuItems] = useState<(MenuItem & { category?: string; inStock?: boolean; img?: string; desc?: string; addOns?: any[] })[]>([]);
  const categories = ["All", ...Array.from(new Set(menuItems.map(m => m.category || "Other")))];

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>("received");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderTotal, setOrderTotal] = useState<number>(0);
  const [orderEta, setOrderEta] = useState<string>("");

  const [instructions, setInstructions] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [tableLockedByQR, setTableLockedByQR] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuLoading, setMenuLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const submittingRef = useRef(false);

  const [paymentMethod, setPaymentMethod] = useState<"cash" | "paystack">("cash");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [addOnModalItem, setAddOnModalItem] = useState<any | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<any[]>([]);

  const [kyekyePoints, setKyekyePoints] = useState(0);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");

  const [heroImage, setHeroImage] = useState("");
  const [brandName, setBrandName] = useState("Kyekye");
  const [brandTagline, setBrandTagline] = useState("Fresh · Flavourful · Made with love");
  const [brandColor, setBrandColor] = useState("#D32F2F");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailItem, setDetailItem] = useState<any | null>(null);
  const [swipedItemId, setSwipedItemId] = useState<string | null>(null);
  const swipeTouchX = useRef<number>(0);

  // Order type
  const [orderType, setOrderType] = useState<"dine_in" | "pickup" | "delivery">("dine_in");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // --- Offline detection ---
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  // --- Branding from Firestore ---
  useEffect(() => {
    getDoc(doc(db, "settings", "branding")).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.heroImage) setHeroImage(d.heroImage);
      if (d.name) setBrandName(d.name);
      if (d.tagline) setBrandTagline(d.tagline);
      if (d.color) setBrandColor(d.color);
    });
  }, []);

  // --- Read table from QR URL param ---
  useEffect(() => {
    const tableParam = searchParams.get("table");
    const savedOrderId = localStorage.getItem("kyekye_order_id");
    const savedTable = localStorage.getItem("kyekye_table");
    const points = parseInt(localStorage.getItem("kyekye_points") || "0");
    setKyekyePoints(points);

    if (tableParam) {
      const decoded = decodeURIComponent(tableParam);
      // New table scanned — clear old session so we don't inherit someone else's order
      if (savedTable && savedTable !== decoded) {
        localStorage.removeItem("kyekye_order_id");
        localStorage.removeItem("kyekye_history");
        setActiveOrderId(null);
      }
      setSelectedTable(decoded);
      setTableLockedByQR(true);
      localStorage.setItem("kyekye_table", decoded);
    } else if (savedTable) {
      setSelectedTable(savedTable);
    }

    if (!tableParam && savedOrderId) {
      setActiveOrderId(savedOrderId);
      setNavTab("orders");
    }

    const unsubMenu = onSnapshot(collection(db, "menu"), (snap) => {
      setMenuItems(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter((m: any) => m.inStock !== false)
      );
      setMenuLoading(false);
    });
    const unsubTables = onSnapshot(collection(db, "tables"), (snap) => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setTables(loaded);
      // Validate QR-provided table exists
      if (tableParam) {
        const decoded = decodeURIComponent(tableParam);
        const exists = loaded.some((t: any) => t.name === decoded) || decoded === "Takeaway";
        if (!exists) toast(`Table "${decoded}" not found. Please scan the correct QR code.`, "warning");
      }
    });
    const unsubAllOrders = onSnapshot(collection(db, "orders"), (snap) => {
      const hist = JSON.parse(localStorage.getItem("kyekye_history") || "[]");
      setHistoryOrders(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((o: any) => hist.includes(o.id) && o.status === "completed")
      );
    });

    return () => { unsubMenu(); unsubTables(); unsubAllOrders(); };
  }, [searchParams]);

  // --- Live order tracking ---
  useEffect(() => {
    if (!activeOrderId) return;
    const unsub = onSnapshot(doc(db, "orders", activeOrderId), (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      setOrderStatus(data.status);
      setOrderItems(data.items || []);
      setOrderTotal(data.total || 0);
      setOrderEta(data.eta || "");

      if (data.status === "completed") {
        const reviewed = localStorage.getItem(`kyekye_reviewed_${activeOrderId}`);
        if (!reviewed) {
          setShowReviewModal(true);
          const currentPoints = parseInt(localStorage.getItem("kyekye_points") || "0");
          const newPoints = currentPoints + Math.floor(data.total || 0);
          localStorage.setItem("kyekye_points", newPoints.toString());
          setKyekyePoints(newPoints);
        }
      }
    });
    return () => unsub();
  }, [activeOrderId]);

  const submitReview = async () => {
    if (rating === 0) return toast("Please select a rating.", "warning");
    try {
      setLoading(true);
      await addDoc(collection(db, "reviews"), {
        orderId: activeOrderId,
        rating,
        text: reviewText,
        timestamp: serverTimestamp(),
      });
      localStorage.setItem(`kyekye_reviewed_${activeOrderId}`, "true");
      setShowReviewModal(false);
      toast("Thank you for your review!", "success");
    } catch {
      toast("Error submitting review. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const handleAddToCart = useCallback((item: any) => {
    if (item.addOns && item.addOns.length > 0) {
      setAddOnModalItem(item);
      setSelectedAddOns([]);
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1, note: "", img: item.img }];
    });
    toast(`${item.name} added to cart`, "success");
  }, [toast]);

  const confirmAddOns = () => {
    if (!addOnModalItem) return;
    const extraPrice = selectedAddOns.reduce((sum, a) => sum + a.price, 0);
    const nameSuffix = selectedAddOns.length > 0 ? ` (+ ${selectedAddOns.map((a: any) => a.name).join(", ")})` : "";
    const finalItem: CartItem = {
      id: addOnModalItem.id + nameSuffix,
      name: addOnModalItem.name + nameSuffix,
      price: addOnModalItem.price + extraPrice,
      qty: 1,
      note: "",
    };
    setCart(prev => {
      const existing = prev.find(i => i.id === finalItem.id);
      if (existing) return prev.map(i => i.id === finalItem.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, finalItem];
    });
    toast(`${addOnModalItem.name} added to cart`, "success");
    setAddOnModalItem(null);
    setSelectedAddOns([]);
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev =>
      prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0)
    );
  };

  const updateNote = (id: string, note: string) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, note } : i));
  };

  const executeOrder = async (payStatus: string, paystackRef?: string) => {
    const total = cart.reduce((acc, curr) => acc + curr.price * curr.qty, 0);

    if (activeOrderId && orderStatus !== "completed" && orderStatus !== "cancelled") {
      const newItems = [...orderItems];
      cart.forEach(c => {
        const existing = newItems.find(i => i.name === c.name);
        if (existing) existing.quantity += c.qty;
        else newItems.push({ menuItemId: c.id, name: c.name, price: c.price, quantity: c.qty, specialInstructions: c.note || "", status: "received" });
      });
      await updateDoc(doc(db, "orders", activeOrderId), {
        items: newItems,
        total: orderTotal + total,
        updatedAt: Date.now(),
      });
    } else {
      const tableLabel = orderType === "dine_in" ? selectedTable : orderType === "pickup" ? `Pickup – ${customerName}` : `Delivery – ${customerName}`;
      const docRef = await addDoc(collection(db, "orders"), {
        tableNumber: tableLabel,
        orderType,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        deliveryAddress: orderType === "delivery" ? deliveryAddress : null,
        items: cart.map(c => ({
          menuItemId: c.id, name: c.name, price: c.price, quantity: c.qty,
          specialInstructions: c.note || "", status: "received",
        })),
        total,
        status: "received",
        paymentMethod,
        paymentStatus: payStatus,
        paystackRef: paystackRef || null,
        instructions: cart.map(c => c.note).filter(Boolean).join("; ") || "",
        timestamp: serverTimestamp(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      setActiveOrderId(docRef.id);
      localStorage.setItem("kyekye_order_id", docRef.id);
      localStorage.setItem("kyekye_table", selectedTable);

      const history = JSON.parse(localStorage.getItem("kyekye_history") || "[]");
      if (!history.includes(docRef.id)) {
        history.push(docRef.id);
        localStorage.setItem("kyekye_history", JSON.stringify(history));
      }
    }

    setCartOpen(false);
    setCart([]);
    setInstructions("");
    setNavTab("orders");
    toast("Order placed successfully!", "success");
  };

  const placeOrder = async () => {
    if (cart.length === 0) return toast("Your cart is empty.", "warning");
    if (orderType === "dine_in" && !selectedTable) return toast("Please select your table.", "warning");
    if ((orderType === "pickup" || orderType === "delivery") && !customerName.trim()) return toast("Please enter your name.", "warning");
    if ((orderType === "pickup" || orderType === "delivery") && !customerPhone.trim()) return toast("Please enter your phone number.", "warning");
    if (orderType === "delivery" && !deliveryAddress.trim()) return toast("Please enter your delivery address.", "warning");
    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);
    try {
      if (paymentMethod === "paystack") {
        const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
        if (!paystackKey || !window.PaystackPop) {
          toast("Payment gateway unavailable. Please pay cash.", "error");
          setLoading(false);
          return;
        }
        const handler = window.PaystackPop.setup({
          key: paystackKey,
          email: `table-${selectedTable.replace(/\s+/g, "")}@kyekyecuisine.com`,
          amount: Math.round(cartTotal * 100), // Paystack uses pesewas
          currency: "GHS",
          ref: `kyekye-${Date.now()}`,
          onClose: () => {
            toast("Payment window closed.", "info");
            setLoading(false);
          },
          callback: async (response) => {
            await executeOrder("paid_online", response.reference);
            setLoading(false);
          },
        });
        handler.openIframe();
      } else {
        await executeOrder("unpaid");
        setLoading(false);
      }
    } catch (e) {
      console.error(e);
      toast("Error placing order. Please call a waiter.", "error");
      setLoading(false);
    } finally {
      submittingRef.current = false;
    }
  };

  const sendAlert = async (type: string) => {
    try {
      await addDoc(collection(db, "alerts"), {
        table: selectedTable || "Unknown",
        type,
        timestamp: serverTimestamp(),
        active: true,
      });
      toast(type === "bill" ? "Bill request sent. Staff will be right with you!" : "Waiter notified. Someone is on the way!", "success");
    } catch {
      toast("Could not notify staff. Please wave someone over.", "error");
    }
  };

  const cancelOrder = async () => {
    if (!activeOrderId) return;
    if (!confirm("Are you sure you want to cancel this order?")) return;
    await updateDoc(doc(db, "orders", activeOrderId), { status: "cancelled", updatedAt: Date.now() });
    localStorage.removeItem("kyekye_order_id");
    setActiveOrderId(null);
    setNavTab("menu");
    toast("Order cancelled.", "info");
  };

  const accentStyle = { "--primary": brandColor, "--red": brandColor, "--red-deep": brandColor } as React.CSSProperties;

  return (
    <div className={styles.container} style={accentStyle}>
      {/* ── Offline banner ── */}
      {!isOnline && (
        <div className={styles.offlineBanner}>
          <LuWifiOff size={15} style={{ flexShrink: 0 }} /> You're offline — reconnect to place orders
        </div>
      )}

      {navTab === "menu" ? (
        <>
          {/* ── Hero ── */}
          <div className={styles.hero}>
            <div className={styles.heroBg} style={heroImage ? { backgroundImage: `url('${heroImage}')` } : undefined} />
            <div className={styles.heroOverlay} />
            <div className={styles.pointsBadge}>
              <LuStar size={12} fill="currentColor" /> {kyekyePoints} pts
            </div>
            <div className={styles.heroContent}>
              <p className={styles.heroEyebrow}>Authentic Ghanaian Cuisine</p>
              <h1 className={styles.restaurantName}>{brandName}<span style={{ color: brandColor }}>.</span></h1>
              <p className={styles.heroSubline}>{brandTagline}</p>
            </div>
            <div className={styles.heroRed} />
          </div>

          {/* ── Trust bar ── */}
          <div className={styles.trustBar}>
            <span className={styles.trustBadge}><span className={styles.trustDot} />Secure ordering</span>
            <span className={styles.trustBadge}><span className={styles.trustDot} />Paystack protected</span>
            <span className={styles.trustBadge}><span className={styles.trustDot} />Live kitchen</span>
          </div>

          {tableLockedByQR && selectedTable && (
            <div className={styles.tableLockBanner}>
              <span className={styles.tableLockDot} />
              Seated at <strong>{selectedTable}</strong>
              <span style={{ marginLeft: "auto", fontSize: "0.7rem", opacity: 0.5 }}>Scan new QR to switch</span>
            </div>
          )}

          {/* Search bar */}
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className={styles.searchInput}
              type="search"
              placeholder="Search dishes…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && <button className={styles.searchClear} onClick={() => setSearchQuery("")}><LuX size={13} /></button>}
          </div>

          <div className={styles.categories}>
            {menuLoading
              ? [1, 2, 3, 4].map(n => <div key={n} className={`skeleton ${styles.categorySkeletonPill}`} />)
              : categories.map(c => (
                  <button key={c} className={`${styles.categoryBtn} ${activeCategory === c ? styles.active : ""}`} onClick={() => setActiveCategory(c)}>
                    {c}
                  </button>
                ))}
          </div>

          <div className={styles.menuList}>
            {menuLoading ? (
              [1, 2, 3, 4, 5].map(n => (
                <div key={n} className={styles.menuItem}>
                  <div className={`skeleton ${styles.itemImage}`} />
                  <div className={styles.itemDetails}>
                    <div className={`skeleton ${styles.skeletonTitle}`} />
                    <div className={`skeleton ${styles.skeletonDesc}`} />
                    <div className={`skeleton ${styles.skeletonDesc}`} style={{ width: "60%" }} />
                    <div className={styles.itemFooter}>
                      <div className={`skeleton ${styles.skeletonPrice}`} />
                      <div className={`skeleton ${styles.skeletonBtn}`} />
                    </div>
                  </div>
                </div>
              ))
            ) : menuItems.filter(item => (activeCategory === "All" || item.category === activeCategory) && (!searchQuery || item.name?.toLowerCase().includes(searchQuery.toLowerCase()) || (item as any).desc?.toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><LuUtensils size={40} strokeWidth={1.5} /></div>
                <h3 className={styles.emptyTitle}>No dishes here yet</h3>
                <p className={styles.emptyDesc}>
                  {activeCategory === "All"
                    ? "The kitchen is working on the menu. Check back soon!"
                    : `No ${activeCategory} available right now. Try another category.`}
                </p>
              </div>
            ) : (
              menuItems
                .filter(item => (activeCategory === "All" || item.category === activeCategory) && (!searchQuery || item.name?.toLowerCase().includes(searchQuery.toLowerCase()) || (item as any).desc?.toLowerCase().includes(searchQuery.toLowerCase())))
                .map(item => (
                  <div key={item.id} className={styles.menuItem} onClick={() => setDetailItem(item)}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      {(item as any).img
                        ? <img src={(item as any).img} alt={item.name} className={styles.itemImage} loading="lazy" />
                        : <div className={styles.itemImagePlaceholder}><LuUtensilsCrossed size={22} strokeWidth={1.5} /></div>}
                      {(item as any).popular && <span className={styles.popularBadge}><LuFlame size={10} /> Popular</span>}
                    </div>
                    <div className={styles.itemDetails}>
                      <h3 className={styles.itemName}>{item.name || "Unnamed Item"}</h3>
                      <p className={styles.itemDesc}>{(item as any).desc || item.description || ""}</p>
                      <div className={styles.itemFooter}>
                        <span className={styles.itemPrice}>₵{Number(item.price || 0).toFixed(2)}</span>
                        <button className={styles.addBtn} onClick={e => { e.stopPropagation(); handleAddToCart({ id: item.id, name: item.name, price: Number(item.price || 0), img: (item as any).img || "", addOns: (item as any).addOns || [] }); }}>+</button>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </>
      ) : (
        <div className={styles.trackingSection}>
          <h2 style={{ fontSize: "2rem", marginBottom: "1rem", fontWeight: 800 }}>My Order</h2>

          {activeOrderId ? (
            <>
              <div style={{ background: "var(--surface)", padding: "1rem", borderRadius: "16px", border: "1px solid var(--border)", marginBottom: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ color: "#888", fontSize: "0.9rem", fontWeight: 700 }}>ORDER ID / TABLE</p>
                    <p style={{ fontSize: "1.2rem", fontWeight: 800 }}>#{activeOrderId.slice(0, 5).toUpperCase()} <span style={{ color: "#888", fontSize: "1rem" }}>({selectedTable})</span></p>
                  </div>
                  {orderEta && (
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: "#888", fontSize: "0.9rem", fontWeight: 700 }}>EST. WAIT</p>
                      <p style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--primary)" }}>{orderEta}</p>
                    </div>
                  )}
                </div>

                <hr style={{ margin: "1rem 0", borderColor: "var(--border)" }} />
                <p style={{ color: "#888", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.5rem" }}>YOUR ITEMS</p>
                {orderItems.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.95rem" }}>{item.quantity}x {item.name}</span>
                    <span style={{ fontWeight: 600 }}>₵{(item.quantity * item.price).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed var(--border)", fontWeight: 800 }}>
                  <span>Grand Total</span>
                  <span style={{ color: "var(--primary)" }}>₵{orderTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="trackCard">
                <div className={`trackStep ${["received", "preparing", "ready", "completed"].includes(orderStatus) ? "trackActive" : ""}`}>1. Order Received</div>
                <div className={`trackStep ${["preparing", "ready", "completed"].includes(orderStatus) ? "trackActive" : ""}`}>2. Preparing</div>
                <div className={`trackStep ${["ready", "completed"].includes(orderStatus) ? "trackActive" : ""}`}>3. Ready for Pickup / En Route</div>
              </div>

              <div style={{ marginTop: "3rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {orderStatus === "received" && (
                  <button className={styles.btn} style={{ background: "#f44336", width: "100%" }} onClick={cancelOrder}>Cancel Order</button>
                )}
                <div style={{ display: "flex", gap: "1rem" }}>
                  <button className={styles.btn} style={{ flex: 1, background: "#ff9800", color: "white", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }} onClick={() => sendAlert("help")}><LuConciergeBell size={16} /> Call Waiter</button>
                  <button className={styles.btn} style={{ flex: 1, background: "#2A2421", color: "white", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }} onClick={() => sendAlert("bill")}><LuReceipt size={16} /> Request Bill</button>
                </div>
                <button className={styles.btn} style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", width: "100%" }} onClick={() => setNavTab("menu")}>
                  Browse Menu & Add Items
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", marginTop: "4rem", color: "#888" }}>
              <div style={{ marginBottom: "1rem", color: "var(--ash)" }}><LuUtensils size={48} strokeWidth={1} /></div>
              <p style={{ fontWeight: 700 }}>No active orders.</p>
              <button className={styles.btn} style={{ background: "var(--primary)", marginTop: "2rem" }} onClick={() => setNavTab("menu")}>Browse Menu</button>
            </div>
          )}

          {historyOrders.length > 0 && (
            <div style={{ marginTop: "4rem" }}>
              <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem", fontWeight: 800 }}>Past Orders</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {historyOrders.map(order => (
                  <div key={order.id} style={{ background: "var(--surface)", padding: "1rem", borderRadius: "16px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <span style={{ fontWeight: 800 }}>#{order.id.slice(0, 5).toUpperCase()}</span>
                      <span style={{ color: "#888", fontSize: "0.9rem" }}>{order.timestamp ? new Date(order.timestamp.toMillis()).toLocaleDateString() : ""}</span>
                    </div>
                    <p style={{ color: "#888", fontSize: "0.9rem", marginBottom: "1rem" }}>{order.items?.length || 0} items • ₵{(order.total || 0).toFixed(2)}</p>
                    <button className={styles.btn} style={{ width: "100%", background: "transparent", color: "var(--text)", border: "1px solid var(--border)" }}
                      onClick={() => { order.items?.forEach((i: any) => handleAddToCart({ id: i.menuItemId || i.id, name: i.name, price: i.price, addOns: [] })); setCartOpen(true); }}>
                      Reorder Again
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating cart pill */}
      {cart.length > 0 && navTab === "menu" && (
        <button className={styles.floatingCart} onClick={() => setCartOpen(true)}>
          <span className={styles.floatingCartCount}>{cartCount}</span>
          <span className={styles.floatingCartLabel}>View Order</span>
          <span className={styles.floatingCartTotal}>₵{cartTotal.toFixed(2)}</span>
        </button>
      )}

      {/* Bottom Navigation */}
      <div className={styles.bottomNav}>
        <button className={`${styles.navItem} ${navTab === "menu" ? styles.active : ""}`} onClick={() => setNavTab("menu")}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          Menu
        </button>
        <button className={styles.navItem} onClick={() => setCartOpen(true)}>
          <div style={{ position: "relative" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            {cartCount > 0 && <span className={styles.navBadge}>{cartCount}</span>}
          </div>
          Cart
        </button>
        <button className={`${styles.navItem} ${navTab === "orders" ? styles.active : ""}`} onClick={() => setNavTab("orders")}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          My Order
        </button>
      </div>

      {/* Cart Checkout Modal */}
      {cartOpen && (
        <div className={styles.modalOverlay} onClick={() => setCartOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.dragHandle} />
            <div className={styles.modalHeader}>
              <h2>Your Order</h2>
              <button className={styles.closeBtn} onClick={() => setCartOpen(false)}>×</button>
            </div>

            {cart.length === 0 ? (
              <p style={{ textAlign: "center", color: "#888", padding: "2rem" }}>Your cart is empty.</p>
            ) : (
              <>
                <div style={{ marginBottom: "1.5rem" }}>
                  {cart.map(item => (
                    <div key={item.id}
                      style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1rem", marginBottom: "1rem", position: "relative", overflow: "hidden" }}
                      onTouchStart={e => { swipeTouchX.current = e.touches[0].clientX; setSwipedItemId(null); }}
                      onTouchEnd={e => { if (swipeTouchX.current - e.changedTouches[0].clientX > 72) { setSwipedItemId(item.id); } }}>
                      {swipedItemId === item.id && (
                        <button onClick={() => { updateQty(item.id, -999); setSwipedItemId(null); }}
                          style={{ position: "absolute", right: 0, top: 0, bottom: 0, background: "var(--red)", color: "white", border: "none", padding: "0 1.25rem", fontWeight: 800, fontSize: "0.8125rem", cursor: "pointer", borderRadius: "0 0 0 0", zIndex: 2, animation: "slideInRight 0.15s ease" }}>
                          Remove
                        </button>
                      )}
                      <div className={styles.cartItem} style={{ borderBottom: "none", paddingBottom: "0.5rem", marginBottom: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: 0 }}>
                          {item.img
                            ? <img src={item.img} alt={item.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                            : <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--ash-pale)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ash)", flexShrink: 0 }}><LuUtensilsCrossed size={18} strokeWidth={1.5} /></div>}
                          <div style={{ minWidth: 0 }}>
                            <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</h4>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>₵{item.price.toFixed(2)} each</p>
                          </div>
                        </div>
                        <div className={styles.qtyControls}>
                          <button className={styles.qtyBtn} onClick={() => updateQty(item.id, -1)}>-</button>
                          <span style={{ fontWeight: 700 }}>{item.qty}</span>
                          <button className={styles.qtyBtn} onClick={() => updateQty(item.id, 1)}>+</button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={item.note}
                        onChange={e => updateNote(item.id, e.target.value)}
                        placeholder="Note for kitchen (e.g. no pepper)"
                        style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--ash-pale)", color: "var(--text)", fontSize: "0.8125rem", outline: "none" }}
                      />
                    </div>
                  ))}
                </div>

                {/* ── Order type ── */}
                <h3 className={styles.cartSectionLabel}>How would you like your order?</h3>
                <div className={styles.orderTypeGrid}>
                  {([
                    { key: "dine_in",  Icon: LuUtensils,    label: "Dine In" },
                    { key: "pickup",   Icon: LuShoppingBag, label: "Pickup" },
                    { key: "delivery", Icon: LuBike,        label: "Delivery" },
                  ] as const).map(t => (
                    <button key={t.key}
                      className={`${styles.orderTypeBtn} ${orderType === t.key ? styles.orderTypeActive : ""}`}
                      onClick={() => setOrderType(t.key)}>
                      <span className={styles.orderTypeIcon}><t.Icon size={20} strokeWidth={1.75} /></span>
                      <span className={styles.orderTypeLabel}>{t.label}</span>
                    </button>
                  ))}
                </div>

                {/* Dine In – table */}
                {orderType === "dine_in" && (
                  tableLockedByQR ? (
                    <div className={styles.tableLockedRow}>
                      <span><LuMapPin size={15} /></span>
                      <span>{selectedTable}</span>
                      <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.8rem", marginLeft: "auto" }}>set by QR</span>
                    </div>
                  ) : (
                    <select value={selectedTable} onChange={e => setSelectedTable(e.target.value)} className={styles.cartSelect}>
                      <option value="">Select your table…</option>
                      {tables.map(t => <option key={t.id} value={t.name}>{t.name}{t.seats ? ` (${t.seats} seats)` : ""}</option>)}
                    </select>
                  )
                )}

                {/* Pickup / Delivery – contact fields */}
                {(orderType === "pickup" || orderType === "delivery") && (
                  <div className={styles.contactFields}>
                    <input className={styles.cartInput} type="text" placeholder="Your name *" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                    <input className={styles.cartInput} type="tel" placeholder="Phone number *" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                    {orderType === "delivery" && (
                      <textarea className={styles.cartInput} placeholder="Delivery address — area, street, landmark *" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} rows={3} style={{ resize: "none" }} />
                    )}
                    {orderType === "pickup" && (
                      <div className={styles.pickupNote}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        We'll call you when your order is ready for collection.
                      </div>
                    )}
                    {orderType === "delivery" && (
                      <div className={styles.pickupNote} style={{ background: "#EFF6FF", borderColor: "#BFDBFE", color: "#1D4ED8" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Delivery fees may apply. Our team will confirm your order by phone.
                      </div>
                    )}
                  </div>
                )}

                <h3 style={{ marginBottom: "0.75rem", fontSize: "1.1rem" }}>Payment Method</h3>
                <div className={styles.paymentOptions}>
                  <div className={`${styles.payOption} ${paymentMethod === "cash" ? styles.selected : ""}`} onClick={() => setPaymentMethod("cash")}>
                    <LuBanknote size={26} strokeWidth={1.5} />
                    Pay Cash / POS
                  </div>
                  <div className={`${styles.payOption} ${paymentMethod === "paystack" ? styles.selected : ""}`} onClick={() => setPaymentMethod("paystack")}>
                    <LuCreditCard size={26} strokeWidth={1.5} />
                    Mobile Money / Card
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", marginTop: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.2rem", fontWeight: 800 }}>
                    <span>Total</span>
                    <span style={{ color: "var(--primary)" }}>₵{cartTotal.toFixed(2)}</span>
                  </div>
                  <button className={styles.checkoutBtnFull} onClick={placeOrder} disabled={loading || (orderType === "dine_in" && !selectedTable)}>
                    {loading ? "Processing…" : "Place Order →"}
                  </button>
                  <div className={styles.cartSecure}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Payments secured by Paystack · SSL Encrypted
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add-On Selection Modal */}
      {addOnModalItem && (
        <div className={styles.modalOverlay} onClick={() => setAddOnModalItem(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Customize {addOnModalItem.name}</h2>
              <button className={styles.closeBtn} onClick={() => setAddOnModalItem(null)}>×</button>
            </div>
            <p style={{ marginBottom: "1.5rem", color: "#666" }}>Select add-ons to customize your item.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "2rem" }}>
              {addOnModalItem.addOns.map((addon: any, idx: number) => {
                const isSelected = selectedAddOns.some((a: any) => a.name === addon.name);
                return (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface)", padding: "1rem", borderRadius: "12px", border: `2px solid ${isSelected ? "var(--primary)" : "transparent"}`, cursor: "pointer", transition: "all 0.2s" }}
                    onClick={() => setSelectedAddOns(prev => isSelected ? prev.filter((a: any) => a.name !== addon.name) : [...prev, addon])}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ width: "20px", height: "20px", borderRadius: "4px", border: `2px solid ${isSelected ? "var(--primary)" : "#ccc"}`, background: isSelected ? "var(--primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isSelected && <LuCheck size={11} strokeWidth={3} color="white" />}
                      </div>
                      <span style={{ fontWeight: 600 }}>{addon.name}</span>
                    </div>
                    <span style={{ color: "#666", fontWeight: 800 }}>+₵{addon.price.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
            <button className={styles.checkoutBtnFull} onClick={confirmAddOns}>
              Add to Cart • ₵{(addOnModalItem.price + selectedAddOns.reduce((sum: number, a: any) => sum + a.price, 0)).toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {/* Item detail sheet */}
      {detailItem && (
        <div className={styles.modalOverlay} onClick={() => setDetailItem(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ padding: 0, borderRadius: "28px 28px 0 0", overflow: "hidden" }}>
            {detailItem.img
              ? <img src={detailItem.img} alt={detailItem.name} style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }} />
              : <div style={{ width: "100%", height: 160, background: "linear-gradient(135deg,#F0EDEB,#E8E4E0)", display: "flex", alignItems: "center", justifyContent: "center", color: "#C4AFA8" }}><LuUtensils size={56} strokeWidth={1} /></div>}
            <div style={{ padding: "1.375rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom))" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.625rem" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.375rem", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--black)", flex: 1 }}>{detailItem.name}</h2>
                {detailItem.popular && <span style={{ background: "var(--red)", color: "white", fontSize: "0.7rem", fontWeight: 800, padding: "0.25rem 0.625rem", borderRadius: "var(--r-full)", marginLeft: "0.75rem", flexShrink: 0, display: "flex", alignItems: "center", gap: "0.25rem" }}><LuFlame size={10} /> Popular</span>}
              </div>
              {detailItem.desc && <p style={{ color: "var(--ash-dark)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1.25rem" }}>{detailItem.desc}</p>}
              {detailItem.addOns?.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Add-on options</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {detailItem.addOns.map((a: any, i: number) => (
                      <span key={i} style={{ background: "var(--ash-pale)", border: "1px solid var(--border)", borderRadius: "var(--r-full)", padding: "0.3rem 0.75rem", fontSize: "0.8rem", fontWeight: 600 }}>{a.name} +₵{Number(a.price).toFixed(2)}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 800, color: "var(--red)", letterSpacing: "-0.02em" }}>₵{Number(detailItem.price || 0).toFixed(2)}</span>
                <button className={styles.checkoutBtnFull} style={{ width: "auto", padding: "0.875rem 2rem", margin: 0 }}
                  onClick={() => { handleAddToCart({ id: detailItem.id, name: detailItem.name, price: Number(detailItem.price || 0), img: detailItem.img || "", addOns: detailItem.addOns || [] }); setDetailItem(null); }}>
                  Add to Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <div className={styles.modalOverlay} style={{ zIndex: 1000 }}>
          <div className={styles.modalContent}>
            <div className={styles.dragHandle} />
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <div style={{ marginBottom: "0.75rem", color: "var(--red)" }}><LuPartyPopper size={36} strokeWidth={1.5} /></div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.375rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.375rem" }}>How was your meal?</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>You earned <strong style={{ color: "var(--red)" }}>{Math.floor(orderTotal)} pts</strong> — tap a star to rate</p>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginBottom: "1.75rem" }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star} className={`${styles.starBtn} ${star <= rating ? styles.filled : styles.empty}`}
                  onClick={() => setRating(star)} style={{ fontSize: "2.5rem", background: "none", border: "none", cursor: "pointer", transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)", transform: star <= rating ? "scale(1.15)" : "scale(1)" }}>
                  ★
                </button>
              ))}
            </div>
            <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Tell us more… (optional)" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "var(--r-lg)", border: "1.5px solid var(--border)", background: "var(--ash-pale)", color: "var(--text)", marginBottom: "1.25rem", fontFamily: "inherit", resize: "none", minHeight: "80px", fontSize: "0.9375rem", outline: "none" }} />
            <button className={styles.checkoutBtnFull} onClick={submitReview} disabled={loading || rating === 0}>
              {loading ? "Submitting…" : rating === 0 ? "Select a star to continue" : "Submit Review"}
            </button>
            <button onClick={() => { localStorage.setItem(`kyekye_reviewed_${activeOrderId}`, "skipped"); setShowReviewModal(false); }} style={{ width: "100%", marginTop: "0.75rem", padding: "0.75rem", background: "none", border: "none", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}>
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerAppWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading menu...</div>}>
      <CustomerApp />
    </Suspense>
  );
}
