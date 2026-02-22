// Auth Guard Logic

export const requireAuth = (redirectUrl = './login.html') => {
    // Check if user is logged in
    const isLoggedIn = false; // Example condition

    if (!isLoggedIn) {
        console.warn('Unauthorized access, redirecting to login');
        window.location.href = redirectUrl;
    }
};

export const redirectIfAuthenticated = (redirectUrl = './dashboard.html') => {
    const isLoggedIn = false; // Example condition

    if (isLoggedIn) {
        window.location.href = redirectUrl;
    }
};
