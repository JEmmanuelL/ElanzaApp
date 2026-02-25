import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirebaseAuth, getGoogleProvider, getFacebookProvider } from "./config.js";

export const loginWithEmail = async (email, password) => {
    const auth = getFirebaseAuth();
    return await signInWithEmailAndPassword(auth, email, password);
};

export const registerWithEmail = async (email, password) => {
    const auth = getFirebaseAuth();
    return await createUserWithEmailAndPassword(auth, email, password);
};

export const loginWithGoogle = async () => {
    const auth = getFirebaseAuth();
    const provider = getGoogleProvider();
    return await signInWithPopup(auth, provider);
};

export const loginWithFacebook = async () => {
    const auth = getFirebaseAuth();
    const provider = getFacebookProvider();
    return await signInWithPopup(auth, provider);
};

export const logout = async () => {
    const auth = getFirebaseAuth();
    return await signOut(auth);
};

export const observeAuthState = (callback) => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, callback);
};

