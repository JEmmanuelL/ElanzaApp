import { observeAuthState } from '../../core/firebase/auth.js';
import { getDocument, queryCollection } from '../../core/firebase/firestore.js';

let currentUserProfile = null;
let currentUserId = null;
let currentPage = 1;
const PAGE_SIZE = 50;
let lastCursors = []; // array of lastVisible doc snapshots for prev pages
let currentLastDoc = null;
let isLastPage = false;

// Filters
let currentRoleFilter = '';
let currentSearchTerm = '';

export const initDashboard = () => {
    const recordsListEl = document.querySelector('.records-list');
    const welcomeNameEl = document.querySelector('.welcome-name');

    // Only initialize if we are on the dashboard with records
    if (!recordsListEl || !welcomeNameEl) return;

    observeAuthState(async (user) => {
        if (user) {
            currentUserId = user.uid;
            try {
                currentUserProfile = await getDocument('users', user.uid);
                // Security check - If profile is not complete, kick them out to completion page
                if (currentUserProfile && currentUserProfile.perfilCompletado === false) {
                    window.location.href = './completar-perfil.html';
                    return;
                }

                // Strict Role check
                if (!currentUserProfile || !currentUserProfile.Rol) {
                    window.location.href = './servicios.html';
                    return;
                }

                const rol = currentUserProfile.Rol;
                if (rol !== 'Super Administrador') {
                    window.location.href = './servicios.html';
                    return;
                }

                if (currentUserProfile && currentUserProfile.nombre) {
                    welcomeNameEl.textContent = currentUserProfile.nombre;
                } else if (user.displayName) {
                    welcomeNameEl.textContent = user.displayName;
                } else {
                    welcomeNameEl.textContent = user.email.split('@')[0];
                }

                setupEventListeners();
                loadUsers(true);

            } catch (error) {
                console.error("Error fetching admin profile:", error);
            }
        } else {
            window.location.href = './login.html';
        }
    });
};

const setupEventListeners = () => {
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const filterBtn = document.getElementById('filterBtn');
    const filterDropdown = document.getElementById('filterDropdown');
    const roleFilter = document.getElementById('roleFilter');
    const searchInput = document.getElementById('searchInput');

    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            lastCursors.pop(); // remove current last
            currentLastDoc = lastCursors[lastCursors.length - 1] || null;
            loadUsers(false);
        }
    });

    nextBtn.addEventListener('click', () => {
        if (!isLastPage) {
            currentPage++;
            lastCursors.push(currentLastDoc);
            loadUsers(false);
        }
    });

    filterBtn.addEventListener('click', () => {
        filterDropdown.style.display = filterDropdown.style.display === 'none' ? 'block' : 'none';
    });

    // Close dropdown if clicking outside
    document.addEventListener('click', (e) => {
        if (!filterBtn.contains(e.target) && !filterDropdown.contains(e.target)) {
            filterDropdown.style.display = 'none';
        }
    });

    roleFilter.addEventListener('change', (e) => {
        currentRoleFilter = e.target.value;
        filterDropdown.style.display = 'none';
        resetPaginationAndLoad();
    });

    let timeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            currentSearchTerm = e.target.value.toLowerCase();
            resetPaginationAndLoad();
        }, 500);
    });
};

const resetPaginationAndLoad = () => {
    currentPage = 1;
    lastCursors = [];
    currentLastDoc = null;
    loadUsers(true);
};

const loadUsers = async (isFirstLoad) => {
    const listContainer = document.querySelector('.records-list');
    listContainer.innerHTML = '<p style="text-align:center; padding: 20px;">Cargando registros...</p>';

    try {
        // If searching, we fetch a larger chunk to local-filter because firestore lacks native robust substring search
        let fetchLimit = currentSearchTerm ? 500 : PAGE_SIZE;

        let options = {
            limitNumber: fetchLimit,
            returnSnapshot: true
        };

        if (currentLastDoc && !isFirstLoad && !currentSearchTerm) {
            options.lastVisibleDoc = currentLastDoc;
        }

        const snapshot = await queryCollection('users', [], options);

        let users = [];
        snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });

        if (!currentSearchTerm && users.length > 0) {
            currentLastDoc = snapshot.docs[snapshot.docs.length - 1];
            isLastPage = users.length < PAGE_SIZE;
        } else {
            isLastPage = true;
        }

        // --- Client Side Filtering ---

        // 2. Dropdown filtering
        if (currentRoleFilter) {
            users = users.filter(u => `${u.Rol || 'Usuario Activo'}` === currentRoleFilter);
        }

        // 3. Text Search
        if (currentSearchTerm) {
            users = users.filter(u => {
                const mail = u.email ? u.email.toLowerCase() : '';
                const nom = u.nombre ? u.nombre.toLowerCase() : '';
                return mail.includes(currentSearchTerm) || nom.includes(currentSearchTerm);
            });
            const startIndex = (currentPage - 1) * PAGE_SIZE;
            const paginatedSearchUsers = users.slice(startIndex, startIndex + PAGE_SIZE);
            isLastPage = startIndex + PAGE_SIZE >= users.length;
            users = paginatedSearchUsers;
        }

        renderUsers(users);
        updatePaginationUI();

    } catch (error) {
        console.error("Error loading users:", error);
        listContainer.innerHTML = '<p style="text-align:center; color: red;">Error al cargar registros.</p>';
    }
};

const renderUsers = (users) => {
    const listContainer = document.querySelector('.records-list');
    listContainer.innerHTML = '';

    if (users.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; padding: 20px; color: #666;">No se encontraron registros activos bajo estos filtros.</p>';
        return;
    }

    users.forEach(user => {
        let roleClass = 'role-inactive';
        let roleIcon = './assets/icons/IconApp/sin-verificar.svg';
        let roleName = user.Rol || 'Usuario Activo';

        if (roleName === 'Usuario Activo') {
            roleClass = 'role-active';
            roleIcon = './assets/icons/IconApp/usuario.svg';
        } else if (roleName === 'Administrador') {
            roleClass = 'role-admin';
            roleIcon = './assets/icons/IconApp/adminsitrador.svg';
        } else if (roleName === 'Super Administrador') {
            roleClass = 'role-superadmin';
            roleIcon = './assets/icons/IconApp/super-administrador.svg';
        }

        // Lógica para quitar apellidos del campo nombre si vienen de Google
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const buildSuffixRegex = (str) => {
            if (!str) return null;
            let regexStr = escapeRegExp(str.trim());
            regexStr = regexStr.replace(/[aá]/gi, '[aáAÁ]');
            regexStr = regexStr.replace(/[eé]/gi, '[eéEÉ]');
            regexStr = regexStr.replace(/[ií]/gi, '[iíIÍ]');
            regexStr = regexStr.replace(/[oó]/gi, '[oóOÓ]');
            regexStr = regexStr.replace(/[uúü]/gi, '[uúUÚüÜ]');
            regexStr = regexStr.replace(/\s+/g, '\\s+');
            return new RegExp(`(?:^|\\s+)${regexStr}\\s*$`, 'i');
        };

        let cleanNombre = (user.nombre || '').trim();
        const rxMaterno = buildSuffixRegex(user.apMaterno);
        if (rxMaterno) cleanNombre = cleanNombre.replace(rxMaterno, '');
        const rxPaterno = buildSuffixRegex(user.apPaterno);
        if (rxPaterno) cleanNombre = cleanNombre.replace(rxPaterno, '');

        const nombreBase = cleanNombre || 'Usuario sin nombre';
        const apPaterno = user.apPaterno ? ` ${user.apPaterno.trim()}` : '';
        const apMaterno = user.apMaterno ? ` ${user.apMaterno.trim()}` : '';
        const name = user.nombre ? `${nombreBase}${apPaterno}${apMaterno}`.trim() : 'Usuario sin completar info';
        const email = user.email || 'Sin correo asociado';

        const card = document.createElement('div');
        card.className = `record-card ${roleClass}`;
        card.innerHTML = `
            <div class="record-info">
                <strong>${name}</strong>
                <span>${email}</span>
            </div>
            <div class="record-actions" style="display:flex; align-items:center; gap:20px;">
                <div class="record-role">
                    <div class="role-badge">
                        <img src="${roleIcon}" alt="${roleName}" class="role-icon">
                        <span class="role-name">${roleName}</span>
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <a href="./perfil.html?uid=${user.id}" class="edit-action" style="text-decoration:none; color:inherit; border:1px solid #ddd; border-radius:8px; padding:6px 12px; display:flex; align-items:center; gap:6px;">
                        <span class="edit-text">Editar</span>
                        <img src="./assets/icons/IconApp/flecha.svg" alt="Editar" class="edit-icon">
                    </a>
                    <a href="./asignar-ritual.html?uid=${user.id}" class="edit-action" style="text-decoration:none; background:var(--primary-color, #c19a6b); color:white; border-radius:8px; padding:6px 12px; display:flex; align-items:center; gap:6px;">
                        <span class="edit-text" style="color:white;">Asignar Ritual</span>
                        <img src="./assets/icons/IconApp/flecha.svg" alt="Asignar" class="edit-icon" style="filter: brightness(0) invert(1);">
                    </a>
                </div>
            </div>
        `;
        listContainer.appendChild(card);
    });
};

const updatePaginationUI = () => {
    document.getElementById('pageInfo').textContent = `Página ${currentPage}`;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('prevPageBtn').style.opacity = currentPage === 1 ? '0.5' : '1';

    document.getElementById('nextPageBtn').disabled = isLastPage;
    document.getElementById('nextPageBtn').style.opacity = isLastPage ? '0.5' : '1';
};


