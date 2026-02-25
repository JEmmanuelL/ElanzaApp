import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCgH57y-PtZILDnVO30COVNhtmSnlidc8M",
    authDomain: "elanza-91a64.firebaseapp.com",
    projectId: "elanza-91a64",
    storageBucket: "elanza-91a64.firebasestorage.app",
    messagingSenderId: "1081115909115",
    appId: "1:1081115909115:web:765a62134b82ac7565895e",
    measurementId: "G-NE3D8KY2EH"
};

let app;
let auth;
let db;
let googleProvider;
let facebookProvider;

export const initFirebase = () => {
    if (!app) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app, "elanza");
        googleProvider = new GoogleAuthProvider();
        facebookProvider = new FacebookAuthProvider();
        console.log('[Firebase] Initialized successfully with Firestore');
    }
    return { app, auth, db, googleProvider, facebookProvider };
};

export const getFirebaseApp = () => app;
export const getFirebaseAuth = () => auth;
export const getFirebaseDb = () => db;
export const getGoogleProvider = () => googleProvider;
export const getFacebookProvider = () => facebookProvider;

