import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyABV-8mniMNiRexC9o7-HFSahwSr46Saz8",
  authDomain: "kyekyecuisine.firebaseapp.com",
  projectId: "kyekyecuisine",
  storageBucket: "kyekyecuisine.firebasestorage.app",
  messagingSenderId: "499238300835",
  appId: "1:499238300835:web:47d7ca151d796208f7a316"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createAdmin() {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, "admin@kyekyecuisine.com", "admin12345");
    const user = userCredential.user;
    
    await setDoc(doc(db, "users", user.uid), {
      role: "admin",
      email: user.email
    });
    
    console.log("SUCCESS: Admin created with UID:", user.uid);
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error.message);
    process.exit(1);
  }
}

createAdmin();
