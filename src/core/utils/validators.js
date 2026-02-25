// Data validation utilities

export const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

export const isNotEmpty = (value) => {
    return value !== null && value !== undefined && value.trim() !== '';
};

