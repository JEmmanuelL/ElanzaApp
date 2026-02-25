import { observeAuthState } from '../../core/firebase/auth.js';
import { getDocument } from '../../core/firebase/firestore.js';

export const initServicios = () => {
    const welcomeNameEl = document.querySelector('.servicios-body .welcome-name');

    if (!welcomeNameEl) return;

    observeAuthState(async (user) => {
        if (user) {
            try {
                const userProfile = await getDocument('users', user.uid);

                if (userProfile && userProfile.perfilCompletado === false) {
                    window.location.href = './completar-perfil.html';
                    return;
                }

                if (userProfile && userProfile.nombre) {
                    welcomeNameEl.textContent = userProfile.nombre;
                } else if (user.displayName) {
                    welcomeNameEl.textContent = user.displayName;
                } else {
                    welcomeNameEl.textContent = user.email.split('@')[0];
                }
            } catch (error) {
                console.error("Error fetching user profile:", error);
                welcomeNameEl.textContent = "Usuario";
            }
        } else {
            window.location.href = './login.html';
        }
    });
};

