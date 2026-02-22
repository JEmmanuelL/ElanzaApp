// API Client wrapper for custom internal fetch requests

export const request = async (endpoint, options = {}) => {
    const defaultHeaders = {
        'Content-Type': 'application/json',
        // Add auth tokens here if needed
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    };

    try {
        const response = await fetch(endpoint, config);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
};
