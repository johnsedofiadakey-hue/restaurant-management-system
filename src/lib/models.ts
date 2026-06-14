// Firestore data models — used throughout all pages

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string | null;
  img?: string; // legacy field alias
  isAvailable: boolean;
  inStock?: boolean;
  ingredients: string[];
  addOns?: AddOn[];
}

export interface AddOn {
  name: string;
  price: number;
}

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface Table {
  id: string;
  name: string;
  status: "available" | "occupied" | "waiting_food" | "needs_assistance" | "ready_for_bill";
  assignedWaiterId: string | null;
  seats?: number;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  specialInstructions: string;
  status: "received" | "preparing" | "ready" | "served";
  completed?: boolean; // kitchen tick-off flag
}

export interface Order {
  id: string;
  tableNumber: string; // matches Table.name
  items: OrderItem[];
  total: number;
  status: "received" | "preparing" | "ready" | "completed" | "cancelled";
  paymentStatus: "unpaid" | "paid_online" | "paid_cash";
  paymentMethod: "cash" | "paystack";
  paystackRef: string | null;
  instructions: string;
  eta?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Alert {
  id: string;
  table: string;
  type: "help" | "bill";
  active: boolean;
  timestamp: any; // Firestore Timestamp
}

export interface Review {
  id: string;
  orderId: string;
  rating: number;
  text: string;
  timestamp: any;
}

export interface StaffUser {
  id: string;
  email: string;
  role: "admin" | "supervisor" | "kitchen" | "waiter";
}

export interface AppSettings {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  paystackPublicKey: string | null;
}
