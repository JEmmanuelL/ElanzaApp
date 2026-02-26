import { initFirebase, getFirebaseDb } from '../../core/firebase/config.js';
import { observeAuthState } from '../../core/firebase/auth.js';
import { getDocs, collection, query, orderBy, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { setupModalLogic, openServiceModal } from './modal-servicios.js';

let currentUserProfile = null;
let allServices = [];
let categories = [];
let currentCategoryFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    const welcomeNameEl = document.querySelector('.welcome-name');

    observeAuthState(async (user) => {
        if (user) {
            try {
                // Fetch from our local wrapper or directly
                // Using exact logic from dashboard
                const { getDocument } = await import('../../core/firebase/firestore.js');
                currentUserProfile = await getDocument('users', user.uid);

                if (!currentUserProfile || currentUserProfile.Rol !== 'Super Administrador') {
                    // Redirect non-admins back to dashboard or login
                    window.location.href = './dashboard.html';
                    return;
                }

                const welcomeNameEl = document.getElementById('welcomeNameText');
                if (welcomeNameEl) {
                    if (currentUserProfile.nombre) {
                        welcomeNameEl.textContent = currentUserProfile.nombre;
                    } else if (user.displayName) {
                        welcomeNameEl.textContent = user.displayName;
                    } else {
                        welcomeNameEl.textContent = user.email.split('@')[0];
                    }
                }

                setupModalLogic();
                setupEventListeners();
                await loadServices();

            } catch (error) {
                console.error("Error en auth admin servicios:", error);
            }
        } else {
            window.location.href = './login.html';
        }
    });
});

const setupEventListeners = () => {
    const filtersContainer = document.getElementById('categoryFilters');

    // Delegation for filter pills
    filtersContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            // Remove active class from all
            filtersContainer.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked
            e.target.classList.add('active');

            currentCategoryFilter = e.target.getAttribute('data-category');
            renderServicesGrid();
        }
    });

    // Add Service Button
    const addBtn = document.getElementById('addServiceBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            openServiceModal(null, categories, allServices);
        });
    }
};

const loadServices = async () => {
    const grid = document.getElementById('servicesGrid');
    const filtersContainer = document.getElementById('categoryFilters');

    try {
        const db = getFirebaseDb();
        const servicesRef = collection(db, 'services');
        const q = query(servicesRef, orderBy('order', 'asc'));
        const snapshot = await getDocs(q);

        allServices = [];
        categories = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const service = { id: doc.id, ...data };
            allServices.push(service);

            if (service.isCategory === true) {
                categories.push(service);
            }
        });

        // Generate Category Pills
        filtersContainer.innerHTML = '<button class="filter-pill active" data-category="all">Todos</button>';
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'filter-pill';
            btn.setAttribute('data-category', cat.id);
            btn.textContent = cat.name;
            filtersContainer.appendChild(btn);
        });

        // Ensure current filter still exists, otherwise reset to 'all'
        if (currentCategoryFilter !== 'all' && !categories.find(c => c.id === currentCategoryFilter)) {
            currentCategoryFilter = 'all';
        }

        renderServicesGrid();

    } catch (error) {
        console.error("Error cargando servicios:", error);
        grid.innerHTML = '<p style="color:red; padding:20px;">Error al cargar los servicios.</p>';
    }
};

const renderServicesGrid = () => {
    const grid = document.getElementById('servicesGrid');
    grid.innerHTML = '';

    // Filter services (exclude categories from being shown as cards themselves if they are purely grouping containers)
    // Actually, usually categories are just headings, we only show actual services that have parentServiceId.
    // If the user wants to see categories as cards, we don't filter `isCategory`. But typically we hide them.
    // Let's filter out `isCategory: true`
    let renderableList = allServices.filter(s => s.isCategory !== true);

    if (currentCategoryFilter !== 'all') {
        renderableList = renderableList.filter(s => s.parentServiceId === currentCategoryFilter);
    }

    if (renderableList.length === 0) {
        grid.innerHTML = '<p style="padding:20px; color:#666;">No hay servicios en esta categoría.</p>';
        return;
    }

    renderableList.forEach(service => {
        const card = document.createElement('div');
        card.className = 'service-card';

        let bgHtml = `<img src="./assets/images/rodillos.png" alt="Default" class="service-card-bg" loading="lazy">`;
        if (service.images && service.images.main) {
            bgHtml = `<img src="${service.images.main}" alt="${service.name}" class="service-card-bg" loading="lazy">`;
        }

        const durationInfo = service.durationMinutes ? `${service.durationMinutes} min` : '';
        const activeStatus = service.active === false ? '<span style="color:#fca5a5; font-size:0.8rem; margin-left:8px;">(Inactivo)</span>' : '';

        let iconSrc = './assets/icons/IconApp/templo.svg';
        // Keep the temple filter if using the default, otherwise no filter for the uploaded colored icon
        let iconFilter = 'filter: invert(72%) sepia(13%) saturate(1450%) hue-rotate(9deg) brightness(97%) contrast(87%);';

        if (service.images && service.images.icon) {
            iconSrc = service.images.icon;
            iconFilter = ''; // Remove filter so custom image stays true to upload colors
        }

        card.innerHTML = `
            ${bgHtml}
            <div class="service-card-overlay"></div>
            
            <div class="service-card-header">
                <div class="service-icon-container">
                    <img src="${iconSrc}" alt="Icono" style="width: 24px; height: 24px; object-fit: contain; ${iconFilter}">
                </div>
                
                <div style="position: relative;">
                    <button class="service-options-btn" aria-label="Opciones" data-id="${service.id}">⋮</button>
                    <div class="service-options-menu" id="menu-${service.id}">
                        <div class="service-option-item edit-btn" data-id="${service.id}">
                            ✏️ Editar Servicio
                        </div>
                        <div class="service-option-item delete delete-btn" data-id="${service.id}">
                            🚫 ${service.active ? 'Desactivar' : 'Activar'} Servicio
                        </div>
                    </div>
                </div>
            </div>

            <div class="service-card-info">
                <h3 class="service-title">${service.name}${activeStatus}</h3>
                <div class="service-meta">
                    <span>${durationInfo}</span>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    // Add events for options menus
    const optBtns = grid.querySelectorAll('.service-options-btn');
    optBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const menu = document.getElementById(`menu-${id}`);

            // Close others
            document.querySelectorAll('.service-options-menu').forEach(m => {
                if (m.id !== `menu-${id}`) m.classList.remove('show');
            });

            menu.classList.toggle('show');
        });
    });

    // Close menus when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.service-options-menu').forEach(m => m.classList.remove('show'));
    });

    // Edit and Delete buttons logic placeholder
    const editBtns = grid.querySelectorAll('.edit-btn');
    editBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const serviceData = allServices.find(s => s.id === id);
            openServiceModal(serviceData, categories, allServices);

            // Close the options menu after clicking edit
            const menu = document.getElementById(`menu-${id}`);
            if (menu) menu.classList.remove('show');
        });
    });

    // Toggle Active Status
    const deleteBtns = grid.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const serviceData = allServices.find(s => s.id === id);
            const menu = document.getElementById(`menu-${id}`);
            if (menu) menu.classList.remove('show');

            const isCurrentlyActive = serviceData.active !== false;
            const actionText = isCurrentlyActive ? 'desactivar' : 'activar';

            if (confirm(`¿Estás seguro de que deseas ${actionText} este servicio?`)) {
                try {
                    const db = getFirebaseDb();
                    const docRef = doc(db, 'services', id);
                    await updateDoc(docRef, { active: !isCurrentlyActive });
                    alert(`Servicio ${actionText.replace('ar', 'ado')} con éxito.`);
                    loadServices(); // Reload UI
                } catch (error) {
                    console.error("Error toggling active status", error);
                    alert("Ocurrió un error.");
                }
            }
        });
    });
};
