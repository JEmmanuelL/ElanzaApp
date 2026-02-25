import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    getIdToken
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

/**
 * Fuerza la recarga del token de autenticación del usuario actual.
 * Útil cuando se cambian los Custom Claims (como el rol) desde Cloud Functions
 * para que el frontend obtenga los permisos actualizados inmediatamente.
 * @returns {Promise<string|null>} El nuevo token si hay usuario, o null si no lo hay.
 */
export const forceRefreshToken = async () => {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (user) {
        // El parámetro 'true' fuerza la recarga desde el servidor en lugar de usar el caché
        return await getIdToken(user, true);
    }
    return null;
};
