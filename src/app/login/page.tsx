"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { role } = useAuth();

  if (role) {
    if (role === "admin") router.push("/admin");
    else if (role === "supervisor") router.push("/supervisor");
    else if (role === "kitchen") router.push("/kitchen");
    else if (role === "waiter") router.push("/waiter");
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError("Invalid email or password. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginBox}>
        <div className={styles.brand}>
          <div className={styles.brandDot} />
          <span className={styles.brandName}>Kyekye Cuisine</span>
        </div>

        <h1 className={styles.title}>Staff Portal</h1>
        <p className={styles.subtitle}>Sign in to access your dashboard.</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="email">Email Address</label>
            <input type="email" id="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@kyekye.com" required />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="password">Password</label>
            <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>
      </div>
    </div>
  );
}
