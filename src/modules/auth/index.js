// Auth Module Entry
import { loginWithEmail } from '../../core/firebase/auth.js';
import { select, on } from '../../core/utils/dom.js';

export const initLogin = () => {
    const form = select('#loginForm');

    on(form, 'submit', async (e) => {
        e.preventDefault();

        const email = select('#email').value;
        const password = select('#password').value;

        try {
            console.log('Intentando iniciar sesión...');
            const result = await loginWithEmail(email, password);
            console.log('Login exitoso', result);
            window.location.href = './dashboard.html';
        } catch (error) {
            console.error('Error en login', error);
            alert('Error al iniciar sesión');
        }
    });
};
