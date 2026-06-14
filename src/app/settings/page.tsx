"use client";

import { useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import styles from "../admin/page.module.css";
import { useAuth } from "../../lib/authContext";
import { auth } from "../../lib/firebase";
import { updatePassword } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { user, role } = useAuth();
  const router = useRouter();
  
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    try {
      await updatePassword(user, newPassword);
      alert("Password updated successfully!");
      setNewPassword("");
    } catch (err: any) {
      alert("Error updating password: " + err.message + "\n(Note: You may need to log out and log back in to verify your identity before changing your password).");
    }
    setLoading(false);
  };

  const goBack = () => {
    if (role) {
      router.push(`/${role}`);
    } else {
      router.push("/");
    }
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "supervisor", "kitchen", "waiter"]}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Account Settings</h1>
          <div style={{display: 'flex', gap: '1rem'}}>
            <button className={styles.btn} style={{background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)'}} onClick={goBack}>Back to Dashboard</button>
            <button className={styles.btn} onClick={() => auth.signOut()}>Sign Out</button>
          </div>
        </header>

        <section className={styles.section} style={{maxWidth: '600px', margin: '0 auto', marginTop: '2rem'}}>
          <h2 className={styles.sectionTitle}>Profile Details</h2>
          <div style={{background: 'var(--surface)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '2rem'}}>
            <p style={{color: '#888', fontSize: '0.9rem', fontWeight: 700}}>EMAIL</p>
            <p style={{fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem'}}>{user?.email}</p>
            <p style={{color: '#888', fontSize: '0.9rem', fontWeight: 700}}>ROLE</p>
            <p style={{fontSize: '1.2rem', fontWeight: 800, textTransform: 'uppercase'}}>{role}</p>
          </div>

          <h2 className={styles.sectionTitle}>Update Password</h2>
          <form onSubmit={handleUpdatePassword} style={{background: 'var(--surface)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)'}}>
            <div className={styles.formGroup}>
              <label>New Password</label>
              <input 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                placeholder="Enter new password" 
                required 
                minLength={6} 
              />
            </div>
            <button type="submit" className={styles.btn} disabled={loading} style={{width: '100%'}}>
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        </section>
      </div>
    </ProtectedRoute>
  );
}
