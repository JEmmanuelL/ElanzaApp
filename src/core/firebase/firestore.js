// Firestore wrapper

export const getDocument = async (collection, id) => {
    console.log('[Firestore] Get doc', collection, id);
    return Promise.resolve(null);
};

export const updateDocument = async (collection, id, data) => {
    console.log('[Firestore] Update doc', collection, id, data);
    return Promise.resolve(true);
};

export const queryCollection = async (collection, filters) => {
    console.log('[Firestore] Query', collection, filters);
    return Promise.resolve([]);
};
