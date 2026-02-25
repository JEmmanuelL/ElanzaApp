// Main entry point
import { initFirebase } from './core/firebase/config.js';
import { initLogin, initRegister } from './modules/auth/index.js';
import { initDashboard } from './modules/dashboard/index.js';
import { initProfileCompletion } from './modules/profile/index.js';
import { initServicios } from './modules/servicios/index.js';
import { initPerfil } from './modules/perfil/index.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Elanza App Initialized');

    // Anti-Cache Nuclear Weapon for HTML files
    const ts = new Date().getTime();
    document.querySelectorAll('a').forEach(anchor => {
        let href = anchor.getAttribute('href');
        if (href && href.endsWith('.html') && !href.includes('?')) {
            anchor.setAttribute('href', `${href}?t=${ts}`);
        }
    });

    // Also bust cache for classic forms that might have action attributes pointing to old HTML
    document.querySelectorAll('form').forEach(form => {
        let action = form.getAttribute('action');
        if (action && action.endsWith('.html') && !action.includes('?')) {
            form.setAttribute('action', `${action}?t=${ts}`);
        }
    });

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

    // Initialize Auth modules based on the current page context
    const isLogin = document.getElementById('loginForm');
    if (isLogin) {
        initLogin();
    }

    const isRegister = document.getElementById('registerForm');
    if (isRegister) {
        initRegister();
    }

    // Initialize Dashboard logic
    const isDashboard = document.querySelector('.records-list');
    if (isDashboard) {
        initDashboard();
    }

    // Initialize Profile Completion logic
    const isProfileCompletion = document.getElementById('completeProfileForm');
    if (isProfileCompletion) {
        initProfileCompletion();
    }

    // Initialize Servicios logic
    const isServicios = document.querySelector('.servicios-body');
    if (isServicios) {
        initServicios();
    }

    // Initialize Perfil placeholder logic
    const isPerfil = document.querySelector('.perfil-container');
    if (isPerfil) {
        initPerfil();
    }
});

