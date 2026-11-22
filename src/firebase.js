import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Thay các giá trị YOUR_... bằng cấu hình trong Firebase Console > Project settings > Your apps.
const firebaseConfig = {
  apiKey: "AIzaSyDlcYCrPPLoICJMdsUpvOXJf5VeIIxyEdg",
  authDomain: "music-88407.firebaseapp.com",
  projectId: "music-88407",
  storageBucket: "music-88407.firebasestorage.app",
  messagingSenderId: "708153685328",
  appId: "1:708153685328:web:49b6b4c245ea19e362a855"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
