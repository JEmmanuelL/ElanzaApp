import { observeAuthState } from '../../core/firebase/auth.js';
import { getDocument, setDocument, serverTimestamp } from '../../core/firebase/firestore.js';

export const initProfileCompletion = () => {
    const form = document.getElementById('completeProfileForm');
    const emailDisplay = document.getElementById('correo-display');
    const welcomeMessage = document.getElementById('welcome-message');
    const cancelBtn = document.getElementById('cancelProfileSetup');

    if (!form || !emailDisplay) return;

    let currentUser = null;

    // Wait to see who is logged in
    observeAuthState(async (user) => {
        if (user) {
            currentUser = user;
            emailDisplay.value = user.email;

            if (user.displayName) {
                welcomeMessage.textContent = `¡Bienvenido ${user.displayName.split(' ')[0]}! Nos faltan algunos datos para configurar tu cuenta.`;
            }

            // Try to pre-fill if there's any existing data
            const userProfile = await getDocument('users', user.uid);
            if (userProfile) {
                if (userProfile.apPaterno) document.getElementById('apPaterno').value = userProfile.apPaterno;
                if (userProfile.apMaterno) document.getElementById('apMaterno').value = userProfile.apMaterno;
                if (userProfile.telefono) document.getElementById('telefono').value = userProfile.telefono;
                if (userProfile.fechaNacimiento) {
                    let d = userProfile.fechaNacimiento;
                    if (d.toDate) d = d.toDate(); // From Firestore Timestamp
                    if (d instanceof Date) {
                        let tzoffset = (new Date()).getTimezoneOffset() * 60000;
                        document.getElementById('fechaNacimiento').value = (new Date(d.getTime() - tzoffset)).toISOString().split('T')[0];
                    } else {
                        document.getElementById('fechaNacimiento').value = d;
                    }
                }
                if (userProfile.sexo) document.getElementById('sexo').value = userProfile.sexo;
            }

        } else {
            console.log('No user signed in on profile completion page.');
            window.location.href = './login.html';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert("No se ha detectado usuario activo.");
            return;
        }

        let fechaNac = document.getElementById('fechaNacimiento').value;
        if (fechaNac && typeof fechaNac === 'string') {
            fechaNac = new Date(fechaNac + 'T00:00:00');
        }

        const profileData = {
            apPaterno: document.getElementById('apPaterno').value,
            apMaterno: document.getElementById('apMaterno').value,
            telefono: document.getElementById('telefono').value,
            fechaNacimiento: fechaNac,
            sexo: document.getElementById('sexo').value,
            perfilCompletado: true,
            Rol: 'Usuario Activo',
            updatedAt: serverTimestamp()
        };

        try {
            await setDocument('users', currentUser.uid, profileData);
            console.log("Perfil completado exitosamente");

            // Re-fetch user to check role for redirection
            const updatedUser = await getDocument('users', currentUser.uid);
            const rol = updatedUser && updatedUser.Rol ? updatedUser.Rol : 'Usuario Activo';

            if (rol === 'Super Administrador') {
                window.location.href = './dashboard.html';
            } else {
                window.location.href = './servicios.html';
            }
        } catch (error) {
            console.error("Error al guardar perfil", error);
            alert("Hubo un error al guardar tu información.");
        }
    });

    if (cancelBtn) {
        cancelBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            // Try to logout
            const { logout } = await import('../../core/firebase/auth.js');
            await logout();
            window.location.href = './index.html';
        });
    }
};

