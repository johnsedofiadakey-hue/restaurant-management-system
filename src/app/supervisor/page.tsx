"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import styles from "./page.module.css";
import m from "./menu.module.css";
import { useAuth } from "../../lib/authContext";
import { auth, db, storage } from "../../lib/firebase";
import { firebaseConfig } from "../../lib/firebase";
import { collection, onSnapshot, updateDoc, doc, query, orderBy, addDoc, deleteDoc, setDoc, getDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { LuX, LuFlame, LuStar, LuCheck, LuPencil, LuUserPlus, LuTrash2, LuShieldCheck } from "react-icons/lu";
import { useToast } from "../../components/Toast";
import DashboardNav from "../../components/DashboardNav";

const PRESET_CATEGORIES = ["Mains", "Sides", "Drinks", "Soups", "Starters", "Desserts", "Specials"];

interface AddOn { name: string; price: number; }

export default function SupervisorDashboard() {
  const [activeTab, setActiveTab] = useState("menu");
  const [orders, setOrders] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [editFloorPlan, setEditFloorPlan] = useState(false);
  const [selectedFloorTable, setSelectedFloorTable] = useState<string | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingImgUrl, setExistingImgUrl] = useState("");
  const [existingImgPath, setExistingImgPath] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("Mains");
  const [customCategory, setCustomCategory] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [newAddOns, setNewAddOns] = useState<AddOn[]>([]);

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [newItemPopular, setNewItemPopular] = useState(false);

  // Branding
  const [currentHeroUrl, setCurrentHeroUrl] = useState("");
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroImagePreview, setHeroImagePreview] = useState("");
  const [heroImageProgress, setHeroImageProgress] = useState<number | null>(null);
  const [savingBranding, setSavingBranding] = useState(false);
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  // Staff accounts
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffRole, setStaffRole] = useState("waiter");
  const [staffName, setStaffName] = useState("");
  const [loadingStaff, setLoadingStaff] = useState(false);

  const { toast } = useToast();
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDoc(doc(db, "settings", "branding")).then(snap => {
      if (snap.exists()) setCurrentHeroUrl(snap.data().heroImage || "");
    });
  }, []);

  useEffect(() => {
    const unsubStaff = onSnapshot(collection(db, "users"), snap => {
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubStaff();
  }, []);

  useEffect(() => {
    const unsubs = [
      onSnapshot(query(collection(db, "orders"), orderBy("timestamp", "asc")), s => setOrders(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "menu"), s => setMenuItems(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "reviews"), s => setReviews(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => b.timestamp?.toMillis() - a.timestamp?.toMillis()))),
      onSnapshot(collection(db, "tables"), s => setTables(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "alerts"), s => setAlerts(s.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => a.active))),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // ── Image ────────────────────────────────────────────────────────
  const handleFileSelected = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return toast("Please select an image file.", "error");
    if (file.size > 5 * 1024 * 1024) return toast("Image must be under 5 MB.", "error");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  }, [handleFileSelected]);

  const uploadImage = (): Promise<{ url: string; path: string }> =>
    new Promise((resolve, reject) => {
      if (!imageFile) return reject(new Error("No file"));
      const path = `menu/${Date.now()}_${imageFile.name.replace(/\s+/g, "_")}`;
      const task = uploadBytesResumable(ref(storage, path), imageFile);
      task.on("state_changed",
        snap => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        reject,
        async () => { resolve({ url: await getDownloadURL(task.snapshot.ref), path }); setUploadProgress(null); }
      );
    });

  const clearForm = () => {
    setEditingId(null); setExistingImgUrl(""); setExistingImgPath("");
    setNewItemName(""); setNewItemDesc(""); setNewItemPrice("");
    setNewItemCategory("Mains"); setCustomCategory(""); setUseCustomCategory(false);
    setNewAddOns([]); setImageFile(null); setImagePreview(""); setUploadProgress(null);
    setNewItemPopular(false);
  };

  const saveHeroImage = async () => {
    if (!heroImageFile) return;
    setSavingBranding(true);
    try {
      const path = `settings/hero_${Date.now()}_${heroImageFile.name.replace(/\s+/g, "_")}`;
      const task = uploadBytesResumable(ref(storage, path), heroImageFile);
      task.on("state_changed",
        snap => setHeroImageProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        () => { toast("Upload failed.", "error"); setSavingBranding(false); },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          await setDoc(doc(db, "settings", "branding"), { heroImage: url, heroImagePath: path }, { merge: true });
          setCurrentHeroUrl(url);
          setHeroImageFile(null);
          setHeroImagePreview("");
          setHeroImageProgress(null);
          toast("Hero image updated! Customer menu will reflect it instantly.", "success");
          setSavingBranding(false);
        }
      );
    } catch { toast("Error saving hero image.", "error"); setSavingBranding(false); }
  };

  const effectiveCategory = useCustomCategory ? customCategory : newItemCategory;

  // ── Save ─────────────────────────────────────────────────────────
  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemPrice || !effectiveCategory.trim())
      return toast("Name, category, and price are required.", "warning");
    setSaving(true);
    try {
      let imgUrl = existingImgUrl;
      let imgPath = existingImgPath;
      if (imageFile) {
        if (existingImgPath) { try { await deleteObject(ref(storage, existingImgPath)); } catch {} }
        const uploaded = await uploadImage();
        imgUrl = uploaded.url; imgPath = uploaded.path;
      }
      const payload = {
        name: newItemName.trim(), desc: newItemDesc.trim(),
        price: parseFloat(newItemPrice), category: effectiveCategory.trim(),
        addOns: newAddOns.filter(a => a.name.trim()),
        img: imgUrl || null, imgPath: imgPath || null,
        popular: newItemPopular,
      };
      if (editingId) {
        await updateDoc(doc(db, "menu", editingId), payload);
        toast("Menu item updated.", "success");
      } else {
        await addDoc(collection(db, "menu"), { ...payload, inStock: true });
        toast("Item added to menu.", "success");
      }
      clearForm();
    } catch (err: any) {
      toast("Error saving: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setNewItemName(item.name || ""); setNewItemDesc(item.desc || item.description || "");
    setNewItemPrice(item.price?.toString() || ""); setNewAddOns(item.addOns || []);
    setNewItemPopular(item.popular || false);
    setExistingImgUrl(item.img || ""); setExistingImgPath(item.imgPath || "");
    setImageFile(null); setImagePreview(item.img || "");
    if (PRESET_CATEGORIES.includes(item.category)) {
      setNewItemCategory(item.category); setUseCustomCategory(false);
    } else {
      setCustomCategory(item.category || ""); setUseCustomCategory(true);
    }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDeleteMenu = async (item: any) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    if (item.imgPath) { try { await deleteObject(ref(storage, item.imgPath)); } catch {} }
    await deleteDoc(doc(db, "menu", item.id));
    toast("Menu item deleted.", "info");
  };

  const handleMapClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editFloorPlan || !selectedFloorTable) return;
    const rect = e.currentTarget.getBoundingClientRect();
    await updateDoc(doc(db, "tables", selectedFloorTable), {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
    setSelectedFloorTable(null);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingStaff(true);
    try {
      const secondaryApp = initializeApp(firebaseConfig, `staff-create-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, staffEmail, staffPassword);
      await setDoc(doc(db, "users", cred.user.uid), {
        email: staffEmail,
        name: staffName.trim() || staffEmail.split("@")[0],
        role: staffRole,
      });
      toast(`Account created for ${staffEmail}!`, "success");
      setStaffEmail(""); setStaffPassword(""); setStaffName(""); setStaffRole("waiter");
    } catch (err: any) {
      toast("Error creating account: " + err.message, "error");
    } finally {
      setLoadingStaff(false);
    }
  };

  const handleDeleteStaff = async (id: string, email: string) => {
    if (!confirm(`Revoke access for ${email}? They will no longer be able to log in.`)) return;
    await deleteDoc(doc(db, "users", id));
    toast("Staff access revoked.", "info");
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "supervisor"]}>
      <div className={styles.container}>

        {/* ── HEADER ── */}
        <header className={styles.header}>
          <h1 className={styles.title}>Supervisor Dashboard</h1>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <DashboardNav current="/supervisor" />
            <button className={styles.btn} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white" }} onClick={() => window.location.href = "/settings"}>Settings</button>
            <button className={styles.btn} onClick={() => auth.signOut()}>Sign Out</button>
          </div>
        </header>

        {/* ── TABS ── */}
        <div className={styles.tabs}>
          {[
            { key: "menu", label: "Menu Management" },
            { key: "orders", label: "Live Orders" },
            { key: "reviews", label: "Reviews" },
            { key: "floorplan", label: "Floor Plan" },
            { key: "branding", label: "Branding" },
            { key: "staff", label: "Staff Accounts" },
          ].map(t => (
            <button key={t.key} className={`${styles.tab} ${activeTab === t.key ? styles.active : ""}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            MENU MANAGEMENT
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "menu" && (
          <section className={styles.section}>

            {/* ── Form card ── */}
            <div ref={formRef} className={m.formCard}>
              <h2 className={styles.sectionTitle} style={{ marginBottom: "1.75rem" }}>
                {editingId ? "Edit Menu Item" : "Add New Item"}
              </h2>

              <form onSubmit={handleSaveMenuItem}>
                <div className={m.formGrid}>

                  {/* LEFT — image upload */}
                  <div className={m.formLeft}>
                    <div className={m.uploadLabel}>Item Photo</div>

                    <div
                      className={`${m.dropzone} ${isDragging ? m.dragging : ""}`}
                      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={onDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {imagePreview ? (
                        <div className={m.previewWrap}>
                          <img src={imagePreview} alt="preview" className={m.previewImg} />
                          <button type="button" className={m.removeImg}
                            onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(""); setExistingImgUrl(""); setExistingImgPath(""); }}>
                            <LuX size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className={m.dropPlaceholder}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                          </svg>
                          <p>Drop image here or <span>browse</span></p>
                          <p className={m.dropHint}>JPG · PNG · WEBP · max 5 MB</p>
                        </div>
                      )}
                    </div>

                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => { if (e.target.files?.[0]) handleFileSelected(e.target.files[0]); }} />

                    {uploadProgress !== null && (
                      <>
                        <div className={m.progressBar}>
                          <div className={m.progressFill} style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <p className={m.progressText}>Uploading… {uploadProgress}%</p>
                      </>
                    )}
                  </div>

                  {/* RIGHT — details */}
                  <div className={m.formRight}>

                    <div className={styles.formGroup}>
                      <label>Item Name *</label>
                      <input type="text" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="e.g. Jollof Rice with Chicken" required />
                    </div>

                    <div className={m.priceRow}>
                      <div className={styles.formGroup} style={{ flex: 1, minWidth: 0 }}>
                        <label>Price (₵) *</label>
                        <div className={m.priceInputWrap}>
                          <span className={m.priceCurrency}>₵</span>
                          <input type="number" step="0.01" min="0" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)}
                            placeholder="0.00" required className={m.priceInput} />
                        </div>
                      </div>

                      <div className={styles.formGroup} style={{ flex: 1, minWidth: 0 }}>
                        <label>Status</label>
                        <div style={{ padding: "0.75rem 1rem", border: "1.5px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--ash-pale)", fontSize: "0.875rem", fontWeight: 700, color: "#4CAF50" }}>
                          ✓ In Stock (default)
                        </div>
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label>Category *</label>
                      <div className={m.categoryRow}>
                        <select className={m.categorySelect}
                          value={useCustomCategory ? "__custom__" : newItemCategory}
                          onChange={e => {
                            if (e.target.value === "__custom__") { setUseCustomCategory(true); }
                            else { setUseCustomCategory(false); setNewItemCategory(e.target.value); }
                          }}>
                          {PRESET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="__custom__">+ Custom…</option>
                        </select>
                        {useCustomCategory && (
                          <input type="text" className={m.customCategoryInput} value={customCategory}
                            onChange={e => setCustomCategory(e.target.value)} placeholder="Type category name" autoFocus />
                        )}
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label>Description</label>
                      <textarea rows={3} value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)}
                        placeholder="Describe the dish — ingredients, cooking style, portion size…"
                        style={{ resize: "vertical", fontFamily: "inherit" }} />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem", border: "1.5px solid var(--border)", borderRadius: "var(--r-md)", background: newItemPopular ? "var(--red-tint)" : "var(--ash-pale)", cursor: "pointer", transition: "all 0.15s" }} onClick={() => setNewItemPopular(p => !p)}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "0.875rem", color: newItemPopular ? "var(--red)" : "var(--text)", display: "flex", alignItems: "center", gap: "0.375rem" }}><LuFlame size={14} /> Mark as Popular</p>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>Shows a "Popular" badge on the customer menu</p>
                      </div>
                      <div style={{ width: 40, height: 22, borderRadius: 11, background: newItemPopular ? "var(--red)" : "var(--ash-light)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                        <div style={{ position: "absolute", top: 3, left: newItemPopular ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Add-ons ── */}
                <div className={m.addOnsSection}>
                  <div className={m.addOnsHeader}>
                    <div>
                      <div className={m.addOnsTitle}>Add-ons & Extras</div>
                      <div className={m.addOnsHint}>Optional upgrades customers select at order time</div>
                    </div>
                    <button type="button" className={m.addAddOnBtn}
                      onClick={() => setNewAddOns(prev => [...prev, { name: "", price: 0 }])}>
                      + Add Option
                    </button>
                  </div>

                  {newAddOns.length > 0 && (
                    <div className={m.addOnsList}>
                      {newAddOns.map((addon, idx) => (
                        <div key={idx} className={m.addOnRow}>
                          <input type="text" className={m.addOnName} value={addon.name}
                            onChange={e => { const c = [...newAddOns]; c[idx].name = e.target.value; setNewAddOns(c); }}
                            placeholder="Option name (e.g. Extra Meat)" />
                          <div className={m.addOnPriceWrap}>
                            <span className={m.addOnCurrency}>₵</span>
                            <input type="number" step="0.01" min="0" className={m.addOnPrice}
                              value={addon.price || ""} placeholder="0.00"
                              onChange={e => { const c = [...newAddOns]; c[idx].price = parseFloat(e.target.value) || 0; setNewAddOns(c); }} />
                          </div>
                          <button type="button" className={m.removeAddOn}
                            onClick={() => setNewAddOns(newAddOns.filter((_, i) => i !== idx))}><LuX size={13} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Submit ── */}
                <div className={m.formActions}>
                  <button type="submit" className={styles.btn} disabled={saving}>
                    {saving
                      ? (uploadProgress !== null ? `Uploading ${uploadProgress}%…` : "Saving…")
                      : editingId ? "Update Item" : "Add to Menu"}
                  </button>
                  {editingId && (
                    <button type="button" className={m.cancelBtn} onClick={clearForm}>Cancel</button>
                  )}
                </div>
              </form>
            </div>

            {/* ── Item list ── */}
            <h2 className={styles.sectionTitle} style={{ marginTop: "2.5rem", marginBottom: "1rem" }}>
              Menu Items
              <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "1rem", marginLeft: "0.5rem" }}>({menuItems.length})</span>
            </h2>

            <div className={m.itemGrid}>
              {menuItems.length === 0 && (
                <p style={{ color: "var(--text-muted)", gridColumn: "1 / -1" }}>No items yet — add your first item above.</p>
              )}
              {menuItems.map(item => (
                <div key={item.id} className={m.itemCard}>
                  <div className={m.itemCardImg}>
                    {item.img
                      ? <img src={item.img} alt={item.name} loading="lazy" />
                      : <div className={m.itemCardImgPlaceholder}>{item.name?.[0]?.toUpperCase() || "?"}</div>
                    }
                    <span className={`${m.stockBadge} ${item.inStock !== false ? m.inStock : m.outOfStock}`}>
                      {item.inStock !== false ? "In Stock" : "86'd"}
                    </span>
                  </div>
                  <div className={m.itemCardBody}>
                    <span className={m.itemCardCategory}>{item.category}</span>
                    <h3 className={m.itemCardName}>{item.name}</h3>
                    {item.desc && <p className={m.itemCardDesc}>{item.desc}</p>}
                    {item.addOns?.length > 0 && (
                      <p className={m.itemCardAddOns}>
                        {item.addOns.map((a: AddOn) => `${a.name} +₵${Number(a.price).toFixed(2)}`).join(" · ")}
                      </p>
                    )}
                    <div className={m.itemCardFooter}>
                      <span className={m.itemCardPrice}>₵{Number(item.price).toFixed(2)}</span>
                      <div className={m.itemCardActions}>
                        <button className={m.editBtn} onClick={() => startEdit(item)}>Edit</button>
                        <button className={m.deleteBtn} onClick={() => handleDeleteMenu(item)}>Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════════
            LIVE ORDERS
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "orders" && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Live Order Monitoring</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {orders.filter(o => !["completed", "cancelled"].includes(o.status)).map(order => (
                <div key={order.id} style={{ background: "var(--white)", padding: "1.25rem 1.5rem", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.625rem", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800 }}>{order.tableNumber}</span>
                      <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.625rem", borderRadius: "var(--r-full)", background: order.status === "ready" ? "#E8F5E9" : order.status === "preparing" ? "#FFF8E1" : "var(--ash-pale)", color: order.status === "ready" ? "#2E7D32" : order.status === "preparing" ? "#E65100" : "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" as const }}>
                        {order.status}
                      </span>
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", fontWeight: 700 }}>₵{Number(order.total || 0).toFixed(2)}</span>
                    </div>
                    {order.items?.map((item: any, i: number) => (
                      <div key={i} style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "0.15rem" }}>
                        {item.quantity || item.qty || 1}× {item.name} — ₵{Number(item.price).toFixed(2)}
                      </div>
                    ))}
                  </div>
                  <select value={order.status} onChange={e => updateDoc(doc(db, "orders", order.id), { status: e.target.value })}
                    style={{ padding: "0.5rem 0.875rem", borderRadius: "var(--r-md)", border: "1.5px solid var(--border)", fontSize: "0.875rem", fontWeight: 600, background: "var(--white)", cursor: "pointer", flexShrink: 0 }}>
                    <option value="received">Received</option>
                    <option value="preparing">Preparing</option>
                    <option value="ready">Ready</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              ))}
              {orders.filter(o => !["completed", "cancelled"].includes(o.status)).length === 0 && (
                <p style={{ color: "var(--text-muted)" }}>No active orders right now.</p>
              )}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════════
            REVIEWS
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "reviews" && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Customer Reviews</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {reviews.length === 0 && <p style={{ color: "var(--text-muted)" }}>No reviews yet.</p>}
              {reviews.map(review => (
                <div key={review.id} style={{ background: "var(--white)", padding: "1.5rem", borderRadius: "var(--r-lg)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", gap: "2px" }}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <LuStar key={s} size={16} style={{ color: s <= review.rating ? "#FFB300" : "var(--ash-light)" }} fill={s <= review.rating ? "#FFB300" : "none"} />
                      ))}
                    </div>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      {review.timestamp ? new Date(review.timestamp.toMillis()).toLocaleString() : ""}
                    </span>
                  </div>
                  <p style={{ fontSize: "0.9375rem", lineHeight: 1.6, fontStyle: review.text ? "normal" : "italic", color: review.text ? "var(--text)" : "var(--text-muted)" }}>
                    {review.text || "No comment provided."}
                  </p>
                  <p style={{ color: "var(--ash)", fontSize: "0.75rem", marginTop: "0.75rem", fontWeight: 600, letterSpacing: "0.03em" }}>
                    ORDER #{review.orderId?.slice(0, 5).toUpperCase()}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════════
            FLOOR PLAN
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "floorplan" && (
          <section className={styles.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Interactive Floor Plan</h2>
              <button className={styles.btn}
                style={editFloorPlan ? { background: "#F59E0B" } : { background: "var(--white)", color: "var(--text)", border: "1px solid var(--border)" }}
                onClick={() => { setEditFloorPlan(!editFloorPlan); setSelectedFloorTable(null); }}>
                {editFloorPlan ? <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><LuCheck size={14} strokeWidth={2.5} /> Done Editing</span> : <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><LuPencil size={14} /> Edit Layout</span>}
              </button>
            </div>

            {editFloorPlan && (
              <p style={{ color: "#F59E0B", fontWeight: 700, marginBottom: "1rem", fontSize: "0.875rem" }}>
                Select a table then click anywhere on the grid to move it.
              </p>
            )}

            <div style={{ display: "flex", gap: "1.5rem" }}>
              {editFloorPlan && (
                <div style={{ width: "180px", background: "var(--white)", padding: "1rem", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", flexShrink: 0 }}>
                  <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--text-muted)", marginBottom: "0.75rem" }}>Tables</p>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: "0.4rem" }}>
                    {tables.map(t => (
                      <button key={t.id} onClick={() => setSelectedFloorTable(t.id)}
                        style={{ background: selectedFloorTable === t.id ? "var(--red)" : "transparent", color: selectedFloorTable === t.id ? "white" : "var(--text)", border: "1px solid var(--border)", padding: "0.5rem 0.75rem", borderRadius: "var(--r-sm)", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem", textAlign: "left" as const }}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ flex: 1, height: "580px", background: "var(--white)", borderRadius: "var(--r-xl)", border: "2px dashed var(--border)", position: "relative" as const, overflow: "hidden", cursor: editFloorPlan && selectedFloorTable ? "crosshair" : "default", backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
                onClick={handleMapClick}>
                {tables.map(t => {
                  const tableOrders = orders.filter(o => o.tableNumber === t.name && !["completed", "cancelled"].includes(o.status));
                  const hasAlert = alerts.some(a => a.table === t.name);
                  const bg = hasAlert ? "var(--red)" : tableOrders.length > 0 ? "#F59E0B" : "#4CAF50";
                  return (
                    <div key={t.id}
                      onClick={e => { if (editFloorPlan) { e.stopPropagation(); setSelectedFloorTable(t.id); } }}
                      style={{ position: "absolute" as const, left: `${t.x || 10}%`, top: `${t.y || 10}%`, transform: "translate(-50%, -50%)", width: "72px", height: "72px", background: bg, borderRadius: "50%", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: "0.75rem", cursor: editFloorPlan ? "pointer" : "default", border: selectedFloorTable === t.id ? "3px solid var(--black)" : "2px solid rgba(255,255,255,0.3)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", animation: hasAlert ? "pulse-ring 2s infinite" : "none" }}>
                      <span style={{ textAlign: "center" as const, padding: "0 4px" }}>{t.name}</span>
                      {tableOrders.length > 0 && <span style={{ fontSize: "0.6rem", opacity: 0.85 }}>{tableOrders.length} order{tableOrders.length > 1 ? "s" : ""}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════════
            BRANDING
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "branding" && (
          <section className={styles.section} style={{ maxWidth: 640 }}>
            <h2 className={styles.sectionTitle}>Customer Menu Branding</h2>

            {/* Hero image */}
            <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem", marginBottom: "1.5rem" }}>
              <p style={{ fontWeight: 800, fontSize: "1rem", marginBottom: "0.375rem" }}>Hero Photo</p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "1.25rem" }}>This image appears at the top of the customer menu. Recommended: wide restaurant photo, min 1200×600px.</p>

              {/* Current hero preview */}
              {currentHeroUrl && !heroImagePreview && (
                <div style={{ marginBottom: "1.25rem", borderRadius: "var(--r-lg)", overflow: "hidden", height: 180, position: "relative" }}>
                  <img src={currentHeroUrl} alt="Current hero" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "white", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "var(--r-full)" }}>Current</div>
                </div>
              )}

              {heroImagePreview && (
                <div style={{ marginBottom: "1.25rem", borderRadius: "var(--r-lg)", overflow: "hidden", height: 180, position: "relative" }}>
                  <img src={heroImagePreview} alt="New hero preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", bottom: 8, left: 8, background: "#22C55E", color: "white", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "var(--r-full)" }}>New — not saved yet</div>
                  <button onClick={() => { setHeroImageFile(null); setHeroImagePreview(""); }} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><LuX size={14} /></button>
                </div>
              )}

              <div
                onClick={() => heroFileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) { setHeroImageFile(f); setHeroImagePreview(URL.createObjectURL(f)); } }}
                style={{ border: "2px dashed var(--border)", borderRadius: "var(--r-lg)", padding: "2rem", textAlign: "center", cursor: "pointer", background: "var(--ash-pale)", transition: "border-color 0.15s" }}>
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-muted)" }}>Drop photo here or <span style={{ color: "var(--red)", fontWeight: 700 }}>browse</span></p>
                <p style={{ fontSize: "0.75rem", color: "var(--ash)", marginTop: "0.25rem" }}>JPG · PNG · WEBP · max 5 MB · wide format recommended</p>
              </div>
              <input ref={heroFileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { setHeroImageFile(f); setHeroImagePreview(URL.createObjectURL(f)); } }} />

              {heroImageProgress !== null && (
                <div style={{ marginTop: "1rem", height: 6, background: "var(--ash-light)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${heroImageProgress}%`, background: "var(--red)", borderRadius: 3, transition: "width 0.2s" }} />
                </div>
              )}

              {heroImageFile && (
                <button onClick={saveHeroImage} disabled={savingBranding} className={styles.btn} style={{ marginTop: "1rem", width: "100%" }}>
                  {savingBranding ? `Uploading ${heroImageProgress ?? 0}%…` : "Save Hero Image"}
                </button>
              )}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STAFF ACCOUNTS
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "staff" && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Staff Accounts</h2>

            {/* Create form */}
            <div style={{ background: "var(--white)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.75rem", marginBottom: "2rem", maxWidth: 560 }}>
              <p style={{ fontWeight: 800, fontSize: "1rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <LuUserPlus size={18} /> Create New Staff Account
              </p>
              <form onSubmit={handleCreateStaff} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className={styles.formGroup}>
                  <label>Full Name</label>
                  <input type="text" value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="e.g. Ama Mensah" />
                </div>
                <div className={styles.formGroup}>
                  <label>Email Address *</label>
                  <input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} placeholder="staff@kyekyecuisine.com" required />
                </div>
                <div className={styles.formGroup}>
                  <label>Password *</label>
                  <input type="password" value={staffPassword} onChange={e => setStaffPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} required />
                </div>
                <div className={styles.formGroup}>
                  <label>Role *</label>
                  <select value={staffRole} onChange={e => setStaffRole(e.target.value)}>
                    <option value="waiter">Waiter</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="supervisor">Supervisor</option>
                  </select>
                </div>
                <button type="submit" className={styles.btn} disabled={loadingStaff} style={{ marginTop: "0.25rem" }}>
                  {loadingStaff ? "Creating account…" : "Create Account"}
                </button>
              </form>
            </div>

            {/* Staff directory */}
            <h3 style={{ fontWeight: 800, fontSize: "1rem", marginBottom: "1rem" }}>
              Staff Directory <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.875rem" }}>({staffList.length})</span>
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", maxWidth: 560 }}>
              {staffList.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No staff accounts yet.</p>}
              {staffList.map(staff => (
                <div key={staff.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", background: "var(--white)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", gap: "0.75rem" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: "0.9375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {staff.name || staff.email}
                    </p>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {staff.name ? staff.email : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, padding: "0.25rem 0.625rem", borderRadius: "var(--r-full)", background: staff.role === "admin" || staff.role === "supervisor" ? "var(--red-tint)" : "var(--ash-pale)", color: staff.role === "admin" || staff.role === "supervisor" ? "var(--red)" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      {(staff.role === "admin" || staff.role === "supervisor") && <LuShieldCheck size={11} />}
                      {staff.role}
                    </span>
                    {staff.role !== "admin" && (
                      <button onClick={() => handleDeleteStaff(staff.id, staff.email)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", padding: "0.25rem" }}
                        title="Revoke access">
                        <LuTrash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </ProtectedRoute>
  );
}
