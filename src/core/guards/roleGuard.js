// Role Guard Logic

export const requireRole = (requiredRole, redirectUrl = './dashboard.html') => {
    const userRole = 'user'; // fetch from auth context

    if (userRole !== requiredRole) {
        console.warn('Insufficient permissions');
        window.location.href = redirectUrl;
    }
};
