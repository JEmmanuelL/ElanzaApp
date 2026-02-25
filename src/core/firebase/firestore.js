import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    query,
    where,
    getDocs,
    orderBy,
    limit,
    startAfter,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getFirebaseDb } from "./config.js";

// Export para uso en otros módulos
export { serverTimestamp };

export const getDocument = async (collectionName, id) => {
    const db = getFirebaseDb();
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    } else {
        return null;
    }
};

export const setDocument = async (collectionName, id, data) => {
    const db = getFirebaseDb();
    const docRef = doc(db, collectionName, id);
    await setDoc(docRef, data, { merge: true });
    return { id, ...data };
};

export const updateDocument = async (collectionName, id, data) => {
    const db = getFirebaseDb();
    const docRef = doc(db, collectionName, id);
    await updateDoc(docRef, data);
    return true;
};

export const queryCollection = async (collectionName, filters, options = {}) => {
    // Filters should be an array of { field, op, value }
    const db = getFirebaseDb();
    const collRef = collection(db, collectionName);

    let queryConstraints = [];

    // Add filters
    if (filters && filters.length > 0) {
        filters.forEach(f => queryConstraints.push(where(f.field, f.op, f.value)));
    }

    // Add ordering
    if (options.orderByField) {
        queryConstraints.push(orderBy(options.orderByField, options.orderByDirection || 'asc'));
    }

    // Add limit
    if (options.limitNumber) {
        queryConstraints.push(limit(options.limitNumber));
    }

    // Add pagination start point
    if (options.lastVisibleDoc) {
        queryConstraints.push(startAfter(options.lastVisibleDoc));
    }

    const q = query(collRef, ...queryConstraints);
    const querySnapshot = await getDocs(q);

    // Check if we want the raw snapshot (useful for pagination cursors)
    if (options.returnSnapshot) {
        return querySnapshot;
    }

    const results = [];
    querySnapshot.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() });
    });

    return results;
};

