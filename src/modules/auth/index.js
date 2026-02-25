import { loginWithEmail, registerWithEmail, loginWithGoogle, loginWithFacebook } from '../../core/firebase/auth.js';
import { setDocument, getDocument } from '../../core/firebase/firestore.js';

const saveUserProfile = async (user, additionalData = {}) => {
    try {
        const userProfile = {
            Rol: 'Usuario Activo', // Default role
            email: user.email,
            createdAt: new Date().toISOString(),
            ...additionalData
        };
        await setDocument('users', user.uid, userProfile);
        console.log('Perfil de usuario guardado en Firestore');
    } catch (error) {
        console.error('Error guardando perfil de usuario', error);
    }
};

const handleAuthRedirect = async (uid) => {
    try {
        const userDoc = await getDocument('users', uid);
        if (userDoc && userDoc.perfilCompletado) {
            const rol = userDoc.Rol || 'Usuario Activo';
            if (rol === 'Super Administrador') {
                window.location.href = './dashboard.html';
            } else {
                window.location.href = './servicios.html';
            }
        } else {
            // Missing info, needs to complete profile
            window.location.href = './completar-perfil.html';
        }
    } catch (error) {
        console.error('Error verificando estado del perfil', error);
        window.location.href = './servicios.html'; // Fallback
    }
};

export const initLogin = () => {
    const form = document.getElementById('loginForm');
    const googleBtn = document.querySelector('.btn-google');
    const facebookBtn = document.querySelector('.btn-facebook');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const result = await loginWithEmail(email, password);
                console.log('Login exitoso', result);
                await handleAuthRedirect(result.user.uid);
            } catch (error) {
                console.error('Error en login con email:', error);
                alert('Error al iniciar sesión: ' + error.message);
            }
        });
    }

    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            try {
                const result = await loginWithGoogle();
                console.log('Google login exitoso', result);

                // Check if user exists in Firestore, if not create basic profile
                const userDoc = await getDocument('users', result.user.uid);
                if (!userDoc) {
                    await saveUserProfile(result.user, {
                        nombre: result.user.displayName,
                        authProvider: 'google',
                        perfilCompletado: false,
                        Rol: 'Usuario Activo'
                    });
                }

                await handleAuthRedirect(result.user.uid);
            } catch (error) {
                console.error('Error en login con Google:', error);
                alert('Error en Google Login: ' + error.message);
            }
        });
    }

    if (facebookBtn) {
        facebookBtn.addEventListener('click', async () => {
            try {
                const result = await loginWithFacebook();
                console.log('Facebook login exitoso', result);

                // Check if user exists in Firestore, if not create basic profile
                const userDoc = await getDocument('users', result.user.uid);
                if (!userDoc) {
                    await saveUserProfile(result.user, {
                        nombre: result.user.displayName,
                        authProvider: 'facebook',
                        perfilCompletado: false,
                        Rol: 'Usuario Activo'
                    });
                }

                await handleAuthRedirect(result.user.uid);
            } catch (error) {
                console.error('Error en login con Facebook:', error);
                alert('Error en Facebook Login: ' + error.message);
            }
        });
    }
};

export const initRegister = () => {
    const form = document.getElementById('registerForm');
    const googleBtn = document.querySelector('.btn-google');
    const facebookBtn = document.querySelector('.btn-facebook');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('correo').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (password !== confirmPassword) {
                alert('Las contraseñas no coinciden');
                return;
            }

            const profileData = {
                nombre: document.getElementById('nombre').value,
                apPaterno: document.getElementById('apPaterno').value,
                apMaterno: document.getElementById('apMaterno').value,
                telefono: document.getElementById('telefono').value,
                fechaNacimiento: document.getElementById('fechaNacimiento').value,
                sexo: document.getElementById('sexo').value,
                authProvider: 'email',
                perfilCompletado: true, // Es registro manual, asumimos que llenó todo
                Rol: 'Usuario Activo'
            };

            console.log('Profile Data:', profileData);

            try {
                // 1. Create user in Firebase Auth
                const result = await registerWithEmail(email, password);
                console.log('Registro exitoso en Auth', result);

                // 2. Save extended profile to Firestore
                await saveUserProfile(result.user, profileData);

                await handleAuthRedirect(result.user.uid);
            } catch (error) {
                console.error('Error en registro:', error);
                alert('Error al registrarse: ' + error.message);
            }
        });
    }

    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            try {
                const result = await loginWithGoogle();
                console.log('Google login/registro exitoso', result);

                const userDoc = await getDocument('users', result.user.uid);
                if (!userDoc) {
                    await saveUserProfile(result.user, {
                        nombre: result.user.displayName,
                        authProvider: 'google',
                        perfilCompletado: false,
                        Rol: 'Usuario Activo'
                    });
                }

                await handleAuthRedirect(result.user.uid);
            } catch (error) {
                console.error('Error en registro con Google:', error);
                alert('Error en Google Login: ' + error.message);
            }
        });
    }

    if (facebookBtn) {
        facebookBtn.addEventListener('click', async () => {
            try {
                const result = await loginWithFacebook();
                console.log('Facebook login/registro exitoso', result);

                const userDoc = await getDocument('users', result.user.uid);
                if (!userDoc) {
                    await saveUserProfile(result.user, {
                        nombre: result.user.displayName,
                        authProvider: 'facebook',
                        perfilCompletado: false,
                        Rol: 'Usuario Activo'
                    });
                }

                await handleAuthRedirect(result.user.uid);
            } catch (error) {
                console.error('Error en registro con Facebook:', error);
                alert('Error en Facebook Login: ' + error.message);
            }
        });
    }
};

