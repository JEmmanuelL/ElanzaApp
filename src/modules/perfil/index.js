import { getDocument } from '../../core/firebase/firestore.js';

export const initPerfil = async () => {
    const emailDisplay = document.getElementById('user-email-display');
    const title = document.querySelector('.welcome-name');

    if (!emailDisplay) return;

    // Get uid from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');

    if (!targetUid) {
        title.textContent = "Usuario no especificado";
        emailDisplay.textContent = "Regresa al dashboard y selecciona un usuario válido.";
        return;
    }

    try {
        const userProfile = await getDocument('users', targetUid);
        if (userProfile) {
            title.textContent = `Perfil de ${userProfile.nombre || 'Usuario'}`;
            emailDisplay.textContent = `Correo: ${userProfile.email} | Rol: ${userProfile.Rol || 'Usuario Activo'}`;
        } else {
            title.textContent = "Usuario no encontrado";
            emailDisplay.textContent = "";
        }
    } catch (error) {
        console.error("Error fetching target user profile:", error);
    }
};

