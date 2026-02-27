import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { queryCollection, getDocument } from "../../core/firebase/firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = './index.html';
            return;
        }

        // Obtener el target UID (Mismo patrón que perfil)
        const params = new URLSearchParams(window.location.search);
        let targetUserId = params.get('uid');
        if (!targetUserId) {
            targetUserId = user.uid;
        }

        // Verificar acceso (SuperAdmin o es el dueño)
        const viewerDoc = await getDocument('users', user.uid);
        let allowed = false;
        if (targetUserId === user.uid) allowed = true;
        if (viewerDoc && (viewerDoc.role === 'Super Administrador' || viewerDoc.Rol === 'Super Administrador' || viewerDoc.role === 'Administrador')) allowed = true;

        if (!allowed) {
            alert('No tienes permiso para ver este historial clínico.');
            window.location.href = './dashboard.html';
            return;
        }

        await loadClinicalHistory(targetUserId);
    });
});

async function loadClinicalHistory(userId) {
    const container = document.getElementById('historialContainer');

    try {
        // 1. Obtener todos los paquetes que ha comprado el usuario
        const packages = await queryCollection('userPackages', [{ field: 'userId', op: '==', value: userId }]);

        if (!packages || packages.length === 0) {
            container.innerHTML = `
                <div class="empty-history">
                    <img src="./assets/icons/IconApp/calendario.svg" alt="Vacio">
                    <h3>Sin tratamientos activos</h3>
                    <p>Aún no existen registros de tratamientos clínicos en tu cuenta.</p>
                </div>
            `;
            return;
        }

        // 2. Extraer memoria de catalogo de servicios
        const servicesDict = {};
        const allServices = await queryCollection('services'); // caché
        allServices.forEach(s => { servicesDict[s.id] = s; });

        // Limpiamos el loader
        container.innerHTML = '';

        // 3. Iteramos cada paquete para crear un acordeón
        for (const pkg of packages) {
            const srvObj = servicesDict[pkg.serviceId] || { nombre: 'Servicio Desconocido', images: {} };

            // Sub-consulta: Obtenemos el historial de citas de este paquete (Max 20 por requerimiento DB)
            const appointmentsHistory = await queryCollection(`userPackages/${pkg.id}/appointmentsHistory`, null, {
                field: 'timestamp', direction: 'desc'
            });

            // Creamos bloque Acordeón para este tratamiento
            const accordion = document.createElement('div');
            accordion.className = 'package-accordion';

            // Contar si hay registros
            const apptsCount = appointmentsHistory.length;
            const badgeText = apptsCount === 1 ? '1 registro' : `${apptsCount} registros`;

            // Construir cabecera
            const bgImg = srvObj.images?.main || './assets/images/rodillos.png';
            accordion.innerHTML = `
                <div class="accordion-header">
                    <div class="accordion-title">
                        <img src="${bgImg}" alt="img">
                        <span>${srvObj.nombre || srvObj.name || 'Servicio General'}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:16px;">
                        <span style="font-size:0.85rem; background:#eee; padding:4px 10px; border-radius:30px; color:#555;">${badgeText}</span>
                        <img src="./assets/icons/IconApp/flecha.svg" class="accordion-icon" style="width:16px; transform: rotate(-90deg);">
                    </div>
                </div>
                <div class="accordion-body">
                    <div class="timeline" id="timeline-${pkg.id}"></div>
                </div>
            `;

            // Lógica de Toggle (Desplegar línea de tiempo)
            const headerToggle = accordion.querySelector('.accordion-header');
            const arrowIcon = accordion.querySelector('.accordion-icon');
            headerToggle.addEventListener('click', () => {
                const isOpen = accordion.classList.toggle('open');
                arrowIcon.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(-90deg)';
            });

            container.appendChild(accordion);

            const timelineContainer = document.getElementById(`timeline-${pkg.id}`);

            if (apptsCount === 0) {
                timelineContainer.innerHTML = '<p style="color:#999; text-align:center; padding: 20px 0;">No se han agregado registros clínicos a este tratamiento todavía.</p>';
            } else {
                // Pintar cada cita en la Línea de Tiempo
                appointmentsHistory.forEach(appt => {
                    const tItem = document.createElement('div');
                    tItem.className = 'timeline-item';

                    // Formato Fecha Bonito Ej. 14 de Marzo, 2026 - 10:00 AM
                    let dateStr = 'Fecha desconocida';
                    if (appt.date) {
                        const d = appt.date.toDate ? appt.date.toDate() : new Date(appt.date);
                        dateStr = d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    }

                    // RenderFotos
                    let photosHTML = '';
                    if (appt.photos && Array.isArray(appt.photos) && appt.photos.length > 0) {
                        photosHTML = `<div class="appointment-photos">`;
                        appt.photos.forEach(photoUrl => {
                            photosHTML += `<a href="${photoUrl}" target="_blank"><img src="${photoUrl}" class="photo-thumb" alt="Evidencia Clínica"></a>`;
                        });
                        photosHTML += `</div>`;
                    }

                    tItem.innerHTML = `
                        <div class="timeline-date">${dateStr}</div>
                        <div class="timeline-card">
                            <h4 class="appointment-doctor">
                                <span class="material-icons" style="font-size:18px; color:var(--primary-color);">medical_services</span> 
                                ${appt.doctorName || 'Especialista Elanza'}
                            </h4>
                            <p class="appointment-notes">"${appt.notes || 'Asistencia a sesión de tratamiento completada satisfactoriamente.'}"</p>
                            ${photosHTML}
                        </div>
                    `;
                    timelineContainer.appendChild(tItem);
                });
            }
        }
    } catch (error) {
        console.error("Error al cargar historial clínico:", error);
        container.innerHTML = `<p style="color:red; text-align:center;">Ha ocurrido un problema al consultar el expediente.</p>`;
    }
}
