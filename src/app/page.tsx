import Link from "next/link";
import styles from "./page.module.css";
import { LuUtensils, LuKeyRound, LuActivity, LuQrCode, LuCreditCard } from "react-icons/lu";

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Left panel — brand */}
      <div className={styles.brand}>
        <div className={styles.brandLogo}>
          <span className={styles.brandDot} />
          <span className={styles.brandWordmark}>Kyekye Cuisine</span>
        </div>
        <h1 className={styles.headline}>
          Scan.<br />Order.<br />Enjoy.
        </h1>
        <p className={styles.sub}>
          Ghana's smartest QR-code table ordering system — built for speed, designed for delight.
        </p>
        <div className={styles.pill}>Powered by Paystack · Firebase · Next.js</div>
      </div>

      {/* Right panel — entry points */}
      <div className={styles.cards}>
        <Link href="/menu" className={styles.cardCustomer}>
          <div className={styles.cardIcon}><LuUtensils size={28} /></div>
          <div>
            <h2 className={styles.cardTitle}>Customer Menu</h2>
            <p className={styles.cardDesc}>Browse the menu and place your order from the table.</p>
          </div>
          <span className={styles.cardArrow}>→</span>
        </Link>

        <Link href="/login" className={styles.cardStaff}>
          <div className={styles.cardIcon}><LuKeyRound size={28} /></div>
          <div>
            <h2 className={styles.cardTitle}>Staff Portal</h2>
            <p className={styles.cardDesc}>Kitchen · Waiter · Supervisor · Admin dashboards.</p>
          </div>
          <span className={styles.cardArrow}>→</span>
        </Link>

        <div className={styles.badges}>
          <span className={styles.badge} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4CAF50", display: "inline-block" }} />
            Live Orders
          </span>
          <span className={styles.badge} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <LuActivity size={12} /> Analytics
          </span>
          <span className={styles.badge} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <LuQrCode size={12} /> QR Codes
          </span>
          <span className={styles.badge} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <LuCreditCard size={12} /> Payments
          </span>
        </div>
      </div>
    </main>
  );
}
