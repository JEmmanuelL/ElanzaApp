// Landing Module Entry

import { select, on } from '../../core/utils/dom.js';

export const initLanding = () => {
    console.log('Landing page initialized');

    const btnTemplo = select('#btnTemplo');
    const btnRitual = select('#btnRitual');

    if (btnTemplo) {
        on(btnTemplo, 'click', (e) => {
            // Optional: Add analytics tracking or transition effects here before navigating
            console.log('Navegando al templo (login)');
        });
    }

    if (btnRitual) {
        on(btnRitual, 'click', (e) => {
            console.log('Iniciando ritual (registro/login)');
        });
    }
};

// Initialize if we are on the landing page
document.addEventListener('DOMContentLoaded', () => {
    initLanding();
});

