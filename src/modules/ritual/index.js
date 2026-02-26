import { observeAuthState } from '../../core/firebase/auth.js';
import { getDocument, updateDocument, queryCollection, setDocument } from '../../core/firebase/firestore.js';
import { serverTimestamp } from '../../core/firebase/firestore.js';
import { getFirebaseDb } from '../../core/firebase/config.js';
import { doc, collection } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initFirebase } from '../../core/firebase/config.js';

let currentUserProfile = null; // Super Admin Info
let targetUserId = null;       // User to receive the ritual
let targetUserData = null;     // Fetched data of user
let availableServices = [];    // From DB
let selectedRitualServices = []; // Services the admin picked

export const initRitual = () => {
    // Inicializar Firebase explícitamente primero si no estaba instanciado
    initFirebase();

    // Auth Validation
    observeAuthState(async (user) => {
        if (!user) {
            window.location.href = './login.html';
            return;
        }

        try {
            currentUserProfile = await getDocument('users', user.uid);
            if (!currentUserProfile || currentUserProfile.Rol !== 'Super Administrador') {
                window.location.href = './dashboard.html';
                return;
            }

            document.getElementById('adminName').textContent = currentUserProfile.nombre || 'Super Administrador';
            const adminCard = document.getElementById('adminWelcomeCard');
            if (adminCard) {
                adminCard.style.background = 'linear-gradient(135deg, rgba(242,172,172,0.15) 0%, rgba(255,255,255,1) 100%)';
                // Super Admin pink background
                adminCard.style.border = '1px solid #f2acac';
            }

            const urlParams = new URLSearchParams(window.location.search);
            targetUserId = urlParams.get('uid');

            if (!targetUserId) {
                showCustomAlert('No se especificó un usuario.', () => {
                    window.location.href = './dashboard.html';
                });
                return;
            }

            await loadTargetUser();
            await loadServices();
            setupEventListeners();

        } catch (error) {
            console.error(error);
            showCustomAlert('Error inicializando.');
        }
    });
};

async function loadTargetUser() {
    targetUserData = await getDocument('users', targetUserId);
    if (!targetUserData) {
        showCustomAlert("Usuario no encontrado.", () => {
            window.location.href = './dashboard.html';
        });
        return;
    }

    let fNacStr = '';
    if (targetUserData.fechaNacimiento) {
        // If it's a Firestore Timestamp, it has toDate()
        const dateObj = typeof targetUserData.fechaNacimiento.toDate === 'function'
            ? targetUserData.fechaNacimiento.toDate()
            : new Date(targetUserData.fechaNacimiento);

        fNacStr = dateObj.toISOString().split('T')[0];
    } else if (targetUserData.fechaNac) { // Fallback
        fNacStr = targetUserData.fechaNac;
    }

    let sexoVal = 'Prefiero no decirlo';
    if (targetUserData.sexo) {
        const s = targetUserData.sexo.toLowerCase();
        if (s === 'femenino') sexoVal = 'Femenino';
        else if (s === 'masculino') sexoVal = 'Masculino';
        else if (s === 'otro') sexoVal = 'Otro';
    }

    document.getElementById('nombreInput').value = targetUserData.nombre || '';
    document.getElementById('apPaternoInput').value = targetUserData.apPaterno || '';
    document.getElementById('apMaternoInput').value = targetUserData.apMaterno || '';
    document.getElementById('emailInput').value = targetUserData.email || '';
    document.getElementById('telefonoInput').value = targetUserData.telefono || '';

    // Bubble Full Name & Initial
    const fullName = `${targetUserData.nombre || ''} ${targetUserData.apPaterno || ''}`.trim();
    document.getElementById('profileFullName').textContent = fullName || 'Sin Nombre';
    if (targetUserData.nombre) {
        document.getElementById('profileInitial').textContent = targetUserData.nombre.charAt(0).toUpperCase();
    } else {
        document.getElementById('profileInitial').textContent = '?';
    }

    const roleName = targetUserData.Rol || 'Usuario Activo';
    document.getElementById('rolInput').value = roleName;
    document.getElementById('generoInput').value = sexoVal;
    document.getElementById('fechaNacInput').value = fNacStr;

    // Colorear Header y setear Icono de Rol
    const profileCard = document.getElementById('profileCard');
    const roleIcon = document.getElementById('roleIconHeader');

    // Colores basados en indicaciones
    if (roleName === 'Usuario Activo') { // #6DFF6D
        profileCard.style.background = 'linear-gradient(135deg, rgba(109,255,109,0.15) 0%, rgba(255,255,255,1) 100%)';
        roleIcon.src = './assets/icons/IconApp/verificado.svg';
        roleIcon.style.filter = 'invert(79%) sepia(35%) saturate(849%) hue-rotate(63deg) brightness(101%) contrast(106%)';
    } else if (roleName === 'Administrador') { // #B8ACF2
        profileCard.style.background = 'linear-gradient(135deg, rgba(184,172,242,0.15) 0%, rgba(255,255,255,1) 100%)';
        roleIcon.src = './assets/icons/IconApp/adminsitrador.svg';
        roleIcon.style.filter = 'invert(76%) sepia(14%) saturate(1005%) hue-rotate(211deg) brightness(97%) contrast(93%)';
    } else if (roleName === 'Super Administrador') { // #F2ACAC
        profileCard.style.background = 'linear-gradient(135deg, rgba(242,172,172,0.15) 0%, rgba(255,255,255,1) 100%)';
        roleIcon.src = './assets/icons/IconApp/super-administrador.svg';
        roleIcon.style.filter = 'invert(86%) sepia(11%) saturate(1412%) hue-rotate(308deg) brightness(99%) contrast(92%)';
    } else { // Inactivo #CCCCCC
        profileCard.style.background = 'linear-gradient(135deg, rgba(204,204,204,0.15) 0%, rgba(255,255,255,1) 100%)';
        roleIcon.src = './assets/icons/IconApp/sin-verificar.svg';
        roleIcon.style.filter = 'invert(100%) sepia(1%) saturate(1904%) hue-rotate(200deg) brightness(115%) contrast(79%)';
    }

    // Auth provider mini icon near Email label
    const provider = targetUserData.authProvider || 'email'; // email = nativo
    const provIconMini = document.getElementById('providerIconMini');

    if (provider === 'google') {
        provIconMini.src = './assets/icons/google.svg';
        provIconMini.style.display = 'inline-block';
        document.getElementById('emailInput').disabled = true;
    } else if (provider === 'facebook') {
        provIconMini.src = './assets/icons/facebook.svg';
        provIconMini.style.display = 'inline-block';
        document.getElementById('emailInput').disabled = true;
    } else {
        provIconMini.style.display = 'none'; // hide for native to keep it clean as requested
        document.getElementById('emailInput').disabled = false;
    }
};

async function loadServices() {
    const rawServices = await queryCollection('services', []);
    availableServices = rawServices.filter(s => s._isDeleted !== true && s.active !== false && s.isCategory !== true); // only show active final services

    const grid = document.getElementById('servicesGridModal');
    grid.innerHTML = '';

    availableServices.forEach(srv => {
        const div = document.createElement('div');
        div.className = 'service-card selectable-service-card';
        div.dataset.id = srv.id;

        let bgHtml = `<img src="./assets/images/rodillos.png" alt="Default" class="service-card-bg" loading="lazy" style="border-radius:12px;">`;
        if (srv.images && srv.images.main) {
            bgHtml = `<img src="${srv.images.main}" alt="${srv.nombre}" class="service-card-bg" loading="lazy" style="border-radius:12px;">`;
        }

        const durationInfo = srv.durationMinutes ? `${srv.durationMinutes} min` : '';

        let iconSrc = './assets/icons/IconApp/templo.svg';
        let iconFilter = 'filter: invert(72%) sepia(13%) saturate(1450%) hue-rotate(9deg) brightness(97%) contrast(87%);';

        if (srv.images && srv.images.icon) {
            iconSrc = srv.images.icon;
            iconFilter = '';
        }

        div.innerHTML = `
            <div class="selectable-check-icon" style="display:none; position:absolute; top:-12px; left:-12px; width:36px; height:36px; z-index:10; background:white; border-radius:50%; border: 4px solid #3b82f6; padding: 2px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
                <img src="./assets/icons/IconApp/verificado.svg" alt="Seleccionado" style="width:100%; height:100%; filter: invert(39%) sepia(87%) saturate(1925%) hue-rotate(204deg) brightness(101%) contrast(96%);">
            </div>

            ${bgHtml}
            <div class="service-card-overlay"></div>
            
            <div class="service-card-header" style="justify-content: flex-start; z-index: 2;">
                <div class="service-icon-container" style="margin-right: 10px;">
                    <img src="${iconSrc}" alt="Icono" style="width: 24px; height: 24px; object-fit: contain; ${iconFilter}">
                </div>
            </div>

            <div class="service-card-info" style="align-items: flex-start; text-align:left; z-index: 2;">
                <h3 class="service-title" style="font-size: 1rem; margin-bottom: 5px;">${srv.name || srv.nombre}</h3>
                <div class="service-meta" style="width: 100%; justify-content: space-between;">
                    <span>${durationInfo}</span>
                    <strong style="color:var(--primary-color)">$${srv.precio || 0}</strong>
                </div>
            </div>
        `;

        div.addEventListener('click', () => {
            div.classList.toggle('selected');
        });

        // Set card style overflow visible to let check icon break bounds
        div.style.overflow = 'visible';
        div.style.position = 'relative';

        grid.appendChild(div);
    });
};

function setupEventListeners() {
    // 1. Profile Update
    document.getElementById('userProfileForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const updateData = {
            nombre: document.getElementById('nombreInput').value,
            apPaterno: document.getElementById('apPaternoInput').value,
            apMaterno: document.getElementById('apMaternoInput').value,
            telefono: document.getElementById('telefonoInput').value,
            sexo: document.getElementById('generoInput').value.toLowerCase(), // Save back as sexo
            updatedAt: serverTimestamp()
        };

        const fNacStr = document.getElementById('fechaNacInput').value;
        if (fNacStr) {
            const dateObj = new Date(fNacStr + 'T12:00:00');
            updateData.fechaNacimiento = dateObj;
        }

        const provider = targetUserData.authProvider || 'email';
        if (provider.toLowerCase() === 'email' || provider.toLowerCase() === 'nativo') {
            updateData.email = document.getElementById('emailInput').value;
        }

        try {
            await updateDocument('users', targetUserId, updateData);
            showCustomAlert("Información de usuario actualizada exitosamente.");
            await loadTargetUser(); // reload
        } catch (e) {
            console.error(e);
            showCustomAlert("Error al actualizar usuario");
        }
    });

    // 2. Open Services Modal
    document.getElementById('btnArmarRitual').addEventListener('click', () => {
        document.querySelectorAll('.selectable-service-card').forEach(el => el.classList.remove('selected'));
        selectedRitualServices.forEach(srs => {
            const el = document.querySelector(`.selectable-service-card[data-id="${srs.id}"]`);
            if (el) el.classList.add('selected');
        });
        document.getElementById('modalSelectServices').style.display = 'flex';
    });

    // 3. Cancel/Close Services Modal
    document.getElementById('btnCancelServices').addEventListener('click', () => {
        document.getElementById('modalSelectServices').style.display = 'none';
    });

    // 4. Confirm Services Selection
    document.getElementById('btnConfirmServices').addEventListener('click', () => {
        const selectedNodes = document.querySelectorAll('.selectable-service-card.selected');

        let newlySelected = [];

        selectedNodes.forEach(node => {
            const id = node.dataset.id;
            const existing = selectedRitualServices.find(s => s.id === id);
            if (existing) {
                newlySelected.push(existing);
            } else {
                const srvDef = availableServices.find(s => s.id === id);
                newlySelected.push({
                    id: srvDef.id,
                    nombre: srvDef.name || srvDef.nombre,
                    precioBase: srvDef.precio || 0,
                    imagenBg: srvDef.images?.main || './assets/images/rodillos.png',
                    sesiones: '',
                    precioCobrado: '',
                    configurado: false
                });
            }
        });

        selectedRitualServices = newlySelected;
        renderRitualStack();
        document.getElementById('modalSelectServices').style.display = 'none';
        checkAllConfigured();
    });

    // 5. Payment Modal Logic
    document.getElementById('formaPagoSelect').addEventListener('change', (e) => {
        const val = e.target.value;
        const extraDiv = document.getElementById('extraPagoInfo');
        const extraInput = document.getElementById('extraPagoInput');

        if (val === 'Efectivo') {
            extraDiv.style.display = 'none';
            document.getElementById('btnPagarRitual').disabled = false;
        } else if (val === 'Transferencia' || val === 'Tarjeta de Credito' || val === 'Tarjeta de Debito') {
            extraDiv.style.display = 'block';
            document.getElementById('extraPagoLabel').textContent = val === 'Transferencia' ? 'ID de Clave de Rastreo' : 'ID Folio del recibo';
            extraInput.value = '';
            validatePaymentForm();
        } else {
            extraDiv.style.display = 'none';
            document.getElementById('btnPagarRitual').disabled = true;
        }
    });

    document.getElementById('extraPagoInput').addEventListener('input', validatePaymentForm);

    document.getElementById('btnEditarRitual').addEventListener('click', () => {
        document.getElementById('modalResumenRitual').style.display = 'none';
    });

    document.getElementById('btnPagarRitual').addEventListener('click', processPayment);
};

function renderRitualStack() {
    const stack = document.getElementById('selectedServicesStack');
    stack.innerHTML = '';

    selectedRitualServices.forEach((srv, index) => {
        const card = document.createElement('div');
        card.className = `ritual-service-card ${srv.configurado ? 'configured' : ''}`;

        const bgImageUrl = srv.imagenBg || './assets/images/rodillos.png';

        card.innerHTML = `
            <div class="ritual-stack-card-clickable" style="position:relative; overflow:hidden; border-radius:12px; min-height:100px; padding:16px; display:flex; flex-direction:column; justify-content:flex-end; cursor:pointer;">
                <img src="${bgImageUrl}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:0;" alt="bg">
                <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); z-index:1;"></div>
                
                <h3 style="margin:0; z-index:2; position:relative; color:white;">
                    ${srv.nombre}
                </h3>
                <div style="display:flex; justify-content:space-between; align-items:center; z-index:2; position:relative; margin-top:8px;">
                    <strong class="display-price-saved" style="color:white; font-size:1.1rem;">$${srv.precioCobrado !== '' ? srv.precioCobrado : srv.precioBase}</strong>
                    <span class="icon-check" style="${srv.configurado ? 'display:inline-block; width:auto; color:#6DFF6D; font-weight:bold;' : 'display:none; width:auto;'}">✓ Guardado</span>
                </div>
            </div>
            <div class="ritual-service-config" style="background:#ffffff; padding:16px; border-radius:12px; margin-top:0px; border:1px solid #ddd; position:relative; overflow:visible;">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="color:#000; font-weight:600; display:block; margin-bottom:6px;">Cantidad de sesiones</label>
                    <input type="number" min="1" class="input-sesiones" value="${srv.sesiones}" placeholder="Ej: 5" style="width:100%; color:#000; background:#f9f9f9; border:1px solid #ccc; padding:10px; border-radius:8px; outline:none;">
                    <small class="error-sesiones" style="color:#ef4444; font-size:0.8rem; display:none; margin-top:4px;"></small>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="color:#000; font-weight:600; display:block; margin-bottom:6px;">Precio Total Cobrado</label>
                    <div style="display:flex; align-items:center; background:#f9f9f9; border:1px solid #ccc; border-radius:8px; overflow:hidden;">
                        <span style="padding:10px; color:#55; font-weight:bold; background:#eee; border-right:1px solid #ccc;">$</span>
                        <input type="number" min="0" class="input-precio" value="${srv.precioCobrado || srv.precioBase}" placeholder="Ej: 1500" style="width:100%; color:#000; background:transparent; border:none; padding:10px; outline:none;">
                    </div>
                    <small class="error-precio" style="color:#ef4444; font-size:0.8rem; display:none; margin-top:4px;"></small>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:10px; flex-wrap:wrap;">
                    <button class="btn btn-danger btn-delete-config" style="padding:10px 20px; background:#ef4444; color:white; border:none; border-radius:8px; cursor:pointer; flex: 1; min-width: 120px;">Eliminar</button>
                    <button class="btn btn-primary btn-save-config" style="padding:10px 20px; flex: 1; min-width: 160px;">Guardar Config.</button>
                </div>
            </div>
        `;

        // Default open/close logic for stack wrapper
        if (!srv.configurado && card.classList.contains('configured') === false) {
            card.classList.add('open');
        }

        // Toggle Expand
        card.querySelector('.ritual-stack-card-clickable').addEventListener('click', () => {
            // Close others if you only want 1 open at a time, or comment next line:
            // stack.querySelectorAll('.ritual-service-card').forEach(c => c.classList.remove('open'));
            card.classList.toggle('open');
        });

        // Delete Service
        card.querySelector('.btn-delete-config').addEventListener('click', (e) => {
            e.stopPropagation();
            showCustomConfirm('¿Seguro que deseas eliminar este servicio de tu ritual?', () => {
                selectedRitualServices.splice(index, 1);
                renderRitualStack();
                checkAllConfigured();
            });
        });

        // Save Config
        card.querySelector('.btn-save-config').addEventListener('click', (e) => {
            e.stopPropagation(); // prevent closing

            const errSesiones = card.querySelector('.error-sesiones');
            const errPrecio = card.querySelector('.error-precio');
            errSesiones.style.display = 'none';
            errPrecio.style.display = 'none';

            let sesionesVal = card.querySelector('.input-sesiones').value.trim();
            let precioVal = card.querySelector('.input-precio').value.trim();

            let hasError = false;

            if (!sesionesVal || isNaN(sesionesVal) || parseInt(sesionesVal) <= 0) {
                errSesiones.textContent = "Ingresa un número válido mayor a 0.";
                errSesiones.style.display = 'block';
                hasError = true;
            }

            if (!precioVal || isNaN(precioVal) || parseFloat(precioVal) < 0) {
                errPrecio.textContent = "Ingresa un precio válido y mayor o igual a 0.";
                errPrecio.style.display = 'block';
                hasError = true;
            }

            if (hasError) return;

            // Update state
            selectedRitualServices[index].sesiones = parseInt(sesionesVal);
            selectedRitualServices[index].precioCobrado = parseFloat(precioVal);
            selectedRitualServices[index].configurado = true;

            // Update UI
            card.classList.add('configured');
            card.querySelector('.icon-check').style.display = 'inline-block';
            card.querySelector('.display-price-saved').textContent = '$' + selectedRitualServices[index].precioCobrado.toFixed(2);
            card.classList.remove('open'); // auto-collapse

            checkAllConfigured();
        });

        stack.appendChild(card);
    });
};

function checkAllConfigured() {
    if (selectedRitualServices.length === 0) return;

    const allGreen = selectedRitualServices.every(s => s.configurado === true);
    if (allGreen) {
        openResumenModal();
    }
};

function openResumenModal() {
    const list = document.getElementById('resumenLista');
    list.innerHTML = '';
    let total = 0;

    selectedRitualServices.forEach(s => {
        total += s.precioCobrado;
        list.innerHTML += `
            <div class="resumen-item">
                <div>
                    <strong>${s.nombre}</strong><br>
                    <small>${s.sesiones} sesiones</small>
                </div>
                <div>$${s.precioCobrado.toFixed(2)}</div>
            </div>
        `;
    });

    document.getElementById('resumenTotalAmount').textContent = `$${total.toFixed(2)}`;

    // Reset payment form
    document.getElementById('formaPagoSelect').value = '';
    document.getElementById('extraPagoInfo').style.display = 'none';
    document.getElementById('btnPagarRitual').disabled = true;

    document.getElementById('modalResumenRitual').style.display = 'flex';
};

function validatePaymentForm() {
    const forma = document.getElementById('formaPagoSelect').value;
    const btn = document.getElementById('btnPagarRitual');

    if (forma === 'Efectivo') {
        btn.disabled = false;
    } else if (forma) {
        const extra = document.getElementById('extraPagoInput').value.trim();
        btn.disabled = extra === '';
    } else {
        btn.disabled = true;
    }
};

async function processPayment() {
    const btn = document.getElementById('btnPagarRitual');
    btn.disabled = true;
    btn.textContent = "Procesando...";

    const paymentMethod = document.getElementById('formaPagoSelect').value;
    const receiptFolio = document.getElementById('extraPagoInput').value.trim();

    let totalAmount = 0;
    selectedRitualServices.forEach(s => totalAmount += s.precioCobrado);

    try {
        // En Firestore, por cada "paquete" o "servicio", crearemos un documento en "userPackages"
        for (const srv of selectedRitualServices) {
            const packageData = {
                userId: targetUserId,
                serviceId: srv.id,
                totalAppointments: srv.sesiones,
                usedAppointments: 0,
                payment: {
                    amount: srv.precioCobrado,
                    method: paymentMethod === 'Efectivo' ? 'efectivo' : 'tarjeta',
                    cardType: paymentMethod !== 'Efectivo' ? paymentMethod.toLowerCase() : null,
                    receiptFolio: receiptFolio || null
                },
                purchasedAt: serverTimestamp(),
                purchasedByAdmin: currentUserProfile.id
            };

            // Generating ID natively
            const db = getFirebaseDb();
            const newDocRef = doc(collection(db, 'userPackages'));

            // FIRE-AND-FORGET: Removiendo el 'await' para evitar que el bug de red 400 de WebChannel (Long-Polling) 
            // congele la promesa de respuesta perennemente a pesar de que los datos sí se guardan en el servidor.
            setDocument('userPackages', newDocRef.id, packageData).catch(e => console.warn('Silenced Firebase Stream Error:', e));
        }

        showCustomAlert('¡Paquetes asignados y cobrados exitosamente!', () => {
            window.location.href = './dashboard.html';
        });

    } catch (error) {
        console.error("Error al procesar pago: ", error);
        showCustomAlert('Ocurrió un error al procesar la compra.');
        btn.disabled = false;
        btn.textContent = "Pagar y Asignar";
    }
};

// Helpers UI
export function showCustomAlert(msg, callback = null) {
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

export function showCustomConfirm(msg, callbackOk) {
    const modal = document.getElementById('customConfirmModal');
    if (!modal) { if (confirm(msg)) callbackOk(); return; }
    document.getElementById('customConfirmMessage').textContent = msg;
    modal.style.display = 'flex';

    const btnCancel = document.getElementById('btnCustomConfirmCancel');
    const btnOk = document.getElementById('btnCustomConfirmOk');

    const newCancel = btnCancel.cloneNode(true);
    const newOk = btnOk.cloneNode(true);
    btnCancel.parentNode.replaceChild(newCancel, btnCancel);
    btnOk.parentNode.replaceChild(newOk, btnOk);

    newCancel.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    newOk.addEventListener('click', () => {
        modal.style.display = 'none';
        callbackOk();
    });
}

// Start
initRitual();
