// Auth wrapper around Firebase Authentication

export const loginWithEmail = async (email, password) => {
    // Placeholder login logic
    console.log('[Auth] Attempting login with email', email);
    return Promise.resolve({ user: { email } });
};

export const logout = async () => {
    // Placeholder logout logic
    console.log('[Auth] Logging out');
    return Promise.resolve();
};

export const getCurrentUser = () => {
    // Returns current user or null
    return null;
};
