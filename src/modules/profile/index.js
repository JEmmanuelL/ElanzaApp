import { observeAuthState, logout, getAuthUser, forceRefreshToken, reauthenticateUser, updateUserPassword } from '../../core/firebase/auth.js';
import { getDocument, setDocument, updateDocument, queryCollection, serverTimestamp } from '../../core/firebase/firestore.js';

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
            await logout();
            window.location.href = './index.html';
        });
    }
};

// --- LOGICA DE MI PERFIL (perfil.html) ---

let currentUserProfile = null;
let targetUserId = null;
let targetUserData = null;
let isOwner = false;
let isSuperAdmin = false;
let isAdmin = false;

// Helpers UI
function showCustomAlert(msg, callback = null) {
    const modal = document.getElementById('customAlertModal');
    if (!modal) { alert(msg); if (callback) callback(); return; }
    document.getElementById('customAlertMessage').textContent = msg;
    modal.style.display = 'flex';

    const btnOk = document.getElementById('btnCustomAlertOk');
    const newBtn = btnOk.cloneNode(true);
    btnOk.parentNode.replaceChild(newBtn, btnOk);

    newBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        if (callback) callback();
    });
}

export const initProfile = () => {
    // Si no estamos en la pagina correcta, salir temprano
    if (!document.getElementById('userProfileForm')) return;

    observeAuthState(async (user) => {
        if (!user) {
            window.location.href = './login.html';
            return;
        }

        try {
            currentUserProfile = await getDocument('users', user.uid);
            if (!currentUserProfile) throw new Error("No profile found.");

            const urlParams = new URLSearchParams(window.location.search);
            targetUserId = urlParams.get('uid') || user.uid;

            isOwner = (targetUserId === user.uid);
            isSuperAdmin = (currentUserProfile.role === 'Super Administrador' || currentUserProfile.Rol === 'Super Administrador');
            isAdmin = (currentUserProfile.role === 'Administrador' || currentUserProfile.Rol === 'Administrador');

            // Seguridad: Solo el dueño, Admin o Super Admin pueden ver/editar esto
            if (!isOwner && !isSuperAdmin && !isAdmin) {
                console.warn("Acceso denegado a este perfil.");
                window.location.href = './dashboard.html';
                return;
            }

            await loadTargetUser();
            await loadTargetPackages();
            setupEventListeners();

        } catch (error) {
            console.error("Error inicializando Perfil:", error);
            window.location.href = './dashboard.html';
        }
    });

    document.getElementById('btnLogoutDesktop')?.addEventListener('click', async () => {
        await logout();
        window.location.href = './login.html';
    });
};

async function loadTargetUser() {
    targetUserData = await getDocument('users', targetUserId);
    if (!targetUserData) {
        showCustomAlert("El usuario solicitado no existe.", () => { window.location.href = './dashboard.html'; });
        return;
    }

    // Cabecera superior izquierda
    const fName = `${targetUserData.nombre || ''} ${targetUserData.apPaterno || ''}`.trim() || targetUserData.email || 'Usuario Desconocido';
    document.getElementById('profileFullName').textContent = fName;

    const initial = targetUserData.nombre ? targetUserData.nombre.charAt(0).toUpperCase() : '?';
    document.getElementById('profileInitial').textContent = initial;

    // Rol (Administradores y Super Administradores lo ven)
    const roleContainer = document.getElementById('profileRoleContainer');
    if (isSuperAdmin || isAdmin) {
        roleContainer.style.display = 'inline-flex';

        const userRol = targetUserData.role || targetUserData.Rol || 'Usuario Activo';

        let canEditRole = false;
        if (isSuperAdmin) {
            // Super Admin puede editar a todos EXCEPTO a otro Super Admin
            if (userRol !== 'Super Administrador') {
                canEditRole = true;
            }
        } else if (isAdmin) {
            // Admin puede editar a todos EXCEPTO a otro Admin o a un Super Admin
            if (userRol !== 'Super Administrador' && userRol !== 'Administrador' && userRol !== 'Administrador ') {
                canEditRole = true;
            }
        }

        if (canEditRole) {
            let optionsHTML = `
                <option value="Usuario Activo" ${userRol === 'Usuario Activo' ? 'selected' : ''}>Usuario Activo</option>
                <option value="Usuario Inactivo" ${userRol === 'Usuario Inactivo' ? 'selected' : ''}>Usuario Inactivo</option>
            `;
            // Los administradores no pueden convertir a nadie en Super/Admin. Solo el Super Admin tiene ese poder
            if (isSuperAdmin) {
                optionsHTML += `
                <option value="Administrador" ${userRol === 'Administrador' ? 'selected' : ''}>Administrador</option>
                <option value="Super Administrador" ${userRol === 'Super Administrador' ? 'selected' : ''}>Super Administrador</option>
                `;
            }

            roleContainer.innerHTML = `
                <img src="" alt="Rol Icon" style="width: 14px; height: 14px;">
                <select id="superAdminRoleSelector" class="role-selector-dynamic" style="background: transparent; border: none; font-size: 0.8rem; font-weight: 700; color: inherit; cursor: pointer; outline: none; font-family: var(--font-family); appearance: none; padding-right: 12px; background-image: url('data:image/svg+xml;utf8,<svg fill=%22black%22 height=%2224%22 viewBox=%220 0 24 24%22 width=%2224%22 xmlns=%22http://www.w3.org/2000/svg%22><path d=%22M7 10l5 5 5-5z%22/><path d=%22M0 0h24v24H0z%22 fill=%22none%22/></svg>'); background-repeat: no-repeat; background-position-x: 100%; background-position-y: center; background-size: 14px;">
                    ${optionsHTML}
                </select>
            `;
        } else {
            // Modo "Solo Lectura" del Badge para jerarquías intocables
            roleContainer.innerHTML = `
                <img src="" alt="Rol Icon" style="width: 14px; height: 14px;">
                <span id="profileRoleText">${userRol}</span>
            `;
        }

        updateRoleColors(userRol);

    } else {
        roleContainer.style.display = 'none'; // El cliente normal no necesita ver su rol administrativo
    }

    // Llenado de Formulario
    document.getElementById('nombreInput').value = targetUserData.nombre || '';
    document.getElementById('apPaternoInput').value = targetUserData.apPaterno || '';
    document.getElementById('apMaternoInput').value = targetUserData.apMaterno || '';
    document.getElementById('emailInput').value = targetUserData.email || '';
    document.getElementById('telefonoInput').value = targetUserData.telefono || '';

    if (targetUserData.sexo) {
        const sel = document.getElementById('generoInput');
        let s = targetUserData.sexo.toLowerCase();
        let targetValue = '';

        if (s.includes('mujer') || s.includes('femenin')) targetValue = 'Femenino';
        else if (s.includes('hombre') || s.includes('masculin')) targetValue = 'Masculino';
        else if (s.includes('prefiero') || s.includes('otro')) targetValue = 'Prefiero no decirlo';

        if (targetValue) {
            Array.from(sel.options).forEach(opt => {
                if (opt.value === targetValue) {
                    opt.selected = true;
                }
            });
        }
    }

    if (targetUserData.fechaNacimiento) {
        try {
            let fDate = targetUserData.fechaNacimiento.toDate ? targetUserData.fechaNacimiento.toDate() : new Date(targetUserData.fechaNacimiento);
            const offset = fDate.getTimezoneOffset();
            fDate = new Date(fDate.getTime() - (offset * 60 * 1000));
            document.getElementById('fechaNacInput').value = fDate.toISOString().split('T')[0];
        } catch (e) { console.error(e); }
    }

    // Proveedor visual y Botón de Contraseña
    const provider = targetUserData.authProvider ? targetUserData.authProvider.toLowerCase() : 'email';
    const providerIcon = document.getElementById('providerIconMini');
    const pwdBtn = document.getElementById('btnChangePassword');
    const emailField = document.getElementById('emailInput');

    if (provider === 'google' || provider === 'facebook') {
        // Bloquear y oscurecer el email
        if (emailField) {
            emailField.disabled = true;
            emailField.style.backgroundColor = "#e0e0e0";
            emailField.style.cursor = "not-allowed";
            emailField.style.color = "#888";
            emailField.style.border = "1px solid #ccc";
        }

        const netIcon = provider === 'google'
            ? 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg'
            : 'https://upload.wikimedia.org/wikipedia/commons/b/b8/2021_Facebook_icon.svg';
        providerIcon.src = netIcon;
        providerIcon.style.display = 'inline-block';
        if (pwdBtn) pwdBtn.style.display = 'none';
    } else {
        // Habilitarlo visual y funcionalmente (nativo manual)
        if (emailField) {
            emailField.disabled = false;
            emailField.style.backgroundColor = "#fcfcfc";
            emailField.style.cursor = "text";
            emailField.style.color = "var(--text-color)";
            emailField.style.border = "1.5px solid #e0e0e0";
        }
        providerIcon.style.display = 'none';
        if (pwdBtn) {
            // Logica de contraseña: Solo el dueño REAL puede cambiarse a sí mismo (Firebase Auth)
            if (isOwner) {
                pwdBtn.style.display = 'block';
            } else {
                pwdBtn.style.display = 'none';
            }
        }
    }

    // Al finalizar de inyectar variables en el form, APAGAMOS el boton para resetear su reactividad inicial
    const saveBtn = document.getElementById('btnSaveProfile');
    if (saveBtn) saveBtn.disabled = true;
}

function updateRoleColors(roleStr) {
    const roleContainer = document.getElementById('profileRoleContainer');
    if (!roleContainer) return;

    let bgColor = '#6DFF6D';
    let iconFile = 'verificado.svg';

    if (roleStr === 'Usuario Inactivo') {
        bgColor = '#CCCCCC';
        iconFile = 'sin-verificar.svg';
    } else if (roleStr === 'Administrador' || roleStr === 'Administrador ') {
        bgColor = '#B8ACF2';
        iconFile = 'adminsitrador.svg';
    } else if (roleStr === 'Super Administrador') {
        bgColor = '#F2ACAC';
        iconFile = 'super-administrador.svg';
    }

    roleContainer.style.background = `linear-gradient(135deg, #ffffff 0%, ${bgColor} 100%)`;
    roleContainer.style.color = '#333333';
    const roleIcon = roleContainer.querySelector('img');
    if (roleIcon) {
        roleIcon.src = `./assets/icons/IconApp/${iconFile}`;
        roleIcon.style.filter = 'none';
    }
}

async function loadTargetPackages() {
    const grid = document.getElementById('packagesGrid');
    if (!grid) return;
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#999;">Cargando paquetes...</p>';

    // Consultamos los paquetes del targetUser
    const filters = [{ field: 'userId', op: '==', value: targetUserId }];
    const packages = await queryCollection('userPackages', filters);

    if (packages.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; background:#f5f5f5; border-radius:16px;">
                <p style="color:var(--text-muted); margin:0;">No se registran tratamientos o paquetes activos.</p>
            </div>
        `;
        return;
    }

    // Necesitamos los datos del servicio para el nombre e imagen (Catálogo)
    const servicesDict = {};
    const allServices = await queryCollection('services'); // cache local memory
    allServices.forEach(s => { servicesDict[s.id] = s; });

    // Ordenamos por fecha de compra descendente
    packages.sort((a, b) => {
        let da = a.purchasedAt?.toDate ? a.purchasedAt.toDate().getTime() : 0;
        let db = b.purchasedAt?.toDate ? b.purchasedAt.toDate().getTime() : 0;
        return db - da;
    });

    grid.innerHTML = '';

    packages.forEach(pkg => {
        const srvObj = servicesDict[pkg.serviceId] || { nombre: 'Servicio Desconocido', images: {} };
        const bgImg = srvObj.images?.main || './assets/images/rodillos.png';

        let dateStr = 'Fecha desconocida';
        if (pkg.purchasedAt && pkg.purchasedAt.toDate) {
            dateStr = pkg.purchasedAt.toDate().toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        const total = pkg.totalAppointments || 0;
        const used = pkg.usedAppointments || 0;
        let pcent = total > 0 ? (used / total) * 100 : 0;
        if (pcent > 100) pcent = 100;
        let emptyState = used === 0 ? 'empty' : '';
        let fullState = used >= total ? 'full' : '';

        const card = document.createElement('div');
        card.className = 'package-card';
        card.innerHTML = `
            <div class="package-badge-date" style="font-family: var(--font-family);">Adquirido el ${dateStr}</div>
            <div class="package-image-banner" style="background-image: url('${bgImg}');">
                <h3 style="font-family: var(--font-family); text-shadow: 0 2px 4px rgba(0,0,0,0.5); font-weight: 600;">${srvObj.nombre || srvObj.name || 'Paquete'}</h3>
            </div>
            <div class="package-content" style="font-family: var(--font-family);">
                <div class="progress-container">
                    <div class="progress-header">
                        <span class="progress-label">Citas Agendadas</span>
                        <span class="progress-fraction">${used}/${total}</span>
                    </div>
                    <div class="progress-track" style="margin-bottom:12px;">
                        <div class="progress-fill ${emptyState} ${fullState}" style="width: ${pcent}%"></div>
                    </div>
                </div>
                ${used < total
                ? `<button class="btn-schedule-package" onclick="window.location.href='./calendario.html?pkgId=${pkg.id}'">Agendar Cita</button>`
                : `<button class="btn-schedule-package" disabled>Paquete Agotado</button>`
            }
            </div>
        `;
        grid.appendChild(card);
    });
}

function setupEventListeners() {

    // Habilitar botón al cambiar rol (ya no guarda automático) y ACTUALIZAR COLOR EN VIVO
    document.getElementById('superAdminRoleSelector')?.addEventListener('change', (e) => {
        const btn = document.getElementById('btnSaveProfile');
        if (btn) btn.disabled = false;
        updateRoleColors(e.target.value);
    });

    // Habilitar botón al editar campos de texto
    const formInputs = document.querySelectorAll('#userProfileForm input, #userProfileForm select');
    formInputs.forEach(input => {
        // Ignorar el event Listener de init para no encender el botón en el llenado de loadTargetUserData
        if (input.id === 'superAdminRoleSelector') return;

        input.addEventListener('input', () => {
            const btn = document.getElementById('btnSaveProfile');
            if (btn) btn.disabled = false;
        });
        input.addEventListener('change', () => {
            const btn = document.getElementById('btnSaveProfile');
            if (btn) btn.disabled = false;
        });
    });

    // Regresar
    document.getElementById('btnBackToDashboard')?.addEventListener('click', () => {
        window.location.href = './dashboard.html';
    });

    // Guardar Perfil Basico
    document.getElementById('userProfileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSaveProfile');
        btn.disabled = true;
        btn.textContent = 'Guardando...';

        try {
            const updateData = {
                nombre: document.getElementById('nombreInput').value.trim(),
                apPaterno: document.getElementById('apPaternoInput').value.trim(),
                apMaterno: document.getElementById('apMaternoInput').value.trim(),
                telefono: document.getElementById('telefonoInput').value.trim(),
                sexo: document.getElementById('generoInput').value,
                updatedAt: serverTimestamp()
            };

            const emailField = document.getElementById('emailInput');
            if (emailField && !emailField.disabled) {
                updateData.email = emailField.value.trim();
            }

            const roleSelector = document.getElementById('superAdminRoleSelector');
            if (roleSelector) {
                updateData.role = roleSelector.value;
                updateData.Rol = roleSelector.value; // Retrocompatibilidad para otras vistas
            }

            const fNacStr = document.getElementById('fechaNacInput').value;
            if (fNacStr) {
                const dateObj = new Date(fNacStr + 'T12:00:00');
                updateData.fechaNacimiento = dateObj;
            }

            await updateDocument('users', targetUserId, updateData);
            showCustomAlert('Datos guardados correctamente', async () => {
                await loadTargetUser();
                btn.disabled = false;
                btn.textContent = 'Guardar Cambios';
            });

        } catch (error) {
            console.error("Error al guardar:", error);
            showCustomAlert('Hubo un error al actualizar los datos.');
            btn.disabled = false;
            btn.textContent = 'Guardar Cambios';
        }
    });

    // Abrir Modal Pass
    document.getElementById('btnChangePassword')?.addEventListener('click', () => {
        document.getElementById('passwordForm').reset();
        document.getElementById('passwordErrorMsg').style.display = 'none';
        document.getElementById('modalCambiarPassword').style.display = 'flex';
    });

    // Cerrar Modal Pass
    document.getElementById('btnCancelPassword')?.addEventListener('click', () => {
        document.getElementById('modalCambiarPassword').style.display = 'none';
    });

    // Submit Password
    document.getElementById('passwordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errMsg = document.getElementById('passwordErrorMsg');
        const curr = document.getElementById('currentPasswordInput').value;
        const nuev = document.getElementById('newPasswordInput').value;
        const confirmNuev = document.getElementById('confirmNewPasswordInput').value;
        const btn = document.getElementById('btnSubmitPassword');

        errMsg.style.display = 'none';

        if (nuev !== confirmNuev) {
            errMsg.textContent = 'Las contraseñas nuevas no coinciden.';
            errMsg.style.display = 'block';
            return;
        }

        if (nuev.length < 6) {
            errMsg.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
            errMsg.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.textContent = "Validando...";

        try {
            await reauthenticateUser(curr);
            await updateUserPassword(nuev);

            document.getElementById('modalCambiarPassword').style.display = 'none';
            showCustomAlert('Contraseña cambiada exitosamente.');
            btn.disabled = false;
            btn.textContent = "Actualizar";

        } catch (error) {
            console.error(error);
            errMsg.style.display = 'block';
            if (error.code === 'auth/invalid-credential') {
                errMsg.textContent = "La contraseña actual es incorrecta.";
            } else if (error.code === 'auth/requires-recent-login') {
                errMsg.textContent = "Por seguridad cierra sesión, vuelve a entrar e inténtalo.";
            } else {
                errMsg.textContent = "Error al cambiar de contraseña. Revisa tus datos.";
            }
            btn.disabled = false;
            btn.textContent = "Actualizar";
        }
    });
}
