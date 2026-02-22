// Main entry point
import { initFirebase } from './core/firebase/config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Elanza App Initialized');

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('SW registered: ', registration.scope);
                })
                .catch(registrationError => {
                    console.log('SW registration failed: ', registrationError);
                });
        });
    }

    // Initialize core services
    initFirebase();
});
