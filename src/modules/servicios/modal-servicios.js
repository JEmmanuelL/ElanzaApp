// modal-servicios.js
import { getFirebaseDb } from '../../core/firebase/config.js';
import { uploadServiceImage } from './imageHelpers.js';
import { doc, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let isEditMode = false;
let currentEditingId = null;

// The raw data of the service being edited (so we don't lose anything not in the form)
let currentServiceData = {};

// Keep track of gallery images that exist vs new ones uploaded vs removed
let existingGalleryUrls = [];
let pendingGalleryFiles = [];

export function openServiceModal(serviceData = null, categories = [], allServices = []) {
    const overlay = document.getElementById('serviceModalOverlay');
    overlay.style.display = 'flex';

    // Fill categories dropdown
    const parentSelect = document.getElementById('parentServiceId');
    parentSelect.innerHTML = '<option value="">Ninguna (Es raíz)</option>';
    categories.forEach(cat => {
        // Prevent setting itself as parent
        if (serviceData && serviceData.id === cat.id) return;
        parentSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
    });

    // Fill incompatibilities checkboxes
    const incompatList = document.getElementById('incompatibilitiesList');
    incompatList.innerHTML = '';
    // Let's filter out categories, usually only services can be incompatible
    allServices.filter(s => s.isCategory !== true).forEach(s => {
        if (serviceData && serviceData.id === s.id) return; // Cant be incompatible with itself
        incompatList.innerHTML += `
            <div class="card-checkbox">
                <input type="checkbox" id="incompat_${s.id}" value="${s.id}">
                <label for="incompat_${s.id}">${s.name}</label>
            </div>
        `;
    });

    if (serviceData) {
        isEditMode = true;
        currentEditingId = serviceData.id;
        currentServiceData = { ...serviceData };
        document.getElementById('modalTitle').textContent = 'Editar Servicio';
        populateForm(serviceData);
    } else {
        isEditMode = false;
        currentEditingId = null;
        currentServiceData = {};
        document.getElementById('modalTitle').textContent = 'Agregar Servicio';
        resetForm();
    }
}

export function closeServiceModal() {
    document.getElementById('serviceModalOverlay').style.display = 'none';
    resetForm();
}

function resetForm() {
    document.getElementById('serviceForm').reset();
    document.getElementById('modalStatusMsg').textContent = '';
    document.getElementById('serviceId').value = '';

    // Reset arrays
    document.getElementById('benefitsList').innerHTML = '';
    document.getElementById('recommendationsList').innerHTML = '';
    document.getElementById('aftercareList').innerHTML = '';
    document.getElementById('contraindicationsList').innerHTML = '';
    document.getElementById('medicalQuestionsList').innerHTML = '';
    document.getElementById('medicalQuestionsGroup').style.display = 'none';

    // Reset images previews
    document.getElementById('imgMainPreview').innerHTML = 'Sin imagen';
    document.getElementById('imgIconPreview').innerHTML = 'Sin icono';
    document.getElementById('imgBannerPreview').innerHTML = 'Sin banner';
    document.getElementById('galleryPreviewGrid').innerHTML = '';
    existingGalleryUrls = [];
    pendingGalleryFiles = [];

    // Switch to first tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="tab-basic"]').classList.add('active');
    document.getElementById('tab-basic').classList.add('active');
}

function populateForm(data) {
    // 1. Basic Info
    document.getElementById('serviceId').value = data.id || '';
    document.getElementById('serviceName').value = data.name || '';
    document.getElementById('isCategory').value = data.isCategory === true ? 'true' : 'false';
    document.getElementById('parentServiceId').value = data.parentServiceId || '';
    document.getElementById('durationMinutes').value = data.durationMinutes || 60;
    document.getElementById('capacity').value = data.capacity || 1;
    document.getElementById('order').value = data.order || 1;
    document.getElementById('active').checked = data.active !== false;

    // 2. Images Preview (Inputs remain empty since they are file inputs)
    const imgs = data.images || {};
    if (imgs.main) document.getElementById('imgMainPreview').innerHTML = `<img src="${imgs.main}" style="width:100%; height:100%; object-fit:cover; display:block;">`;
    if (imgs.icon) document.getElementById('imgIconPreview').innerHTML = `<img src="${imgs.icon}" style="width:100%; height:100%; object-fit:contain; display:block;">`;
    if (imgs.banner) document.getElementById('imgBannerPreview').innerHTML = `<img src="${imgs.banner}" style="width:100%; height:100%; object-fit:cover; display:block;">`;

    existingGalleryUrls = imgs.gallery || [];
    renderGalleryPreviews();

    // 3. Texts
    document.getElementById('description').value = data.description || '';
    populateArrayUI('benefitsList', data.benefits || []);
    populateArrayUI('recommendationsList', data.recommendations || []);
    populateArrayUI('aftercareList', data.aftercare || []);
    populateArrayUI('contraindicationsList', data.contraindications || []);

    // 4. Booking Rules
    const br = data.bookingRules || {};
    document.getElementById('brMaxDaily').value = br.maxPerDay || 1;
    document.getElementById('brMaxWeekly').value = br.maxPerWeek || 2;
    document.getElementById('brMaxMonthly').value = br.maxPerMonth || 6;
    document.getElementById('brMinHours').value = br.minAdvanceBookingHours || 12;
    document.getElementById('brMinDaysBetween').value = br.minDaysBetweenAppointments || 0;
    document.getElementById('brMaxFuture').value = br.maxActiveFutureAppointments || 3;

    // 5. Cancellation Policy
    const cp = data.cancellationPolicy || {};
    document.getElementById('allowCancel').checked = cp.allowCancellation !== false;
    document.getElementById('allowReschedule').checked = cp.allowReschedule === true;
    document.getElementById('cancelMinHours').value = cp.minHoursBeforeAppointment || 3;

    // 6. Medical & Incompatibilities
    document.getElementById('requiresDoctor').checked = data.requiresDoctor === true;
    document.getElementById('requiresConsent').checked = data.medicalConsentRequired !== false;

    const requiresMed = data.requiresMedicalForm !== false;
    document.getElementById('requiresMedForm').checked = requiresMed;
    document.getElementById('medicalQuestionsGroup').style.display = requiresMed ? 'block' : 'none';

    // Setup medical questions array
    const defaultMedQuestions = [
        { key: "cirugia_reciente", label: "¿Ha tenido alguna cirugía en los últimos 3 meses?", type: "boolean", required: true },
        { key: "trombosis", label: "¿Tiene antecedentes de trombosis o coágulos?", type: "boolean", required: true },
        { key: "enfermedad_cardiaca", label: "¿Padece alguna enfermedad cardíaca?", type: "boolean", required: true },
        { key: "cancer_activo", label: "¿Actualmente tiene diagnóstico de cáncer activo?", type: "boolean", required: true },
        { key: "medicacion_actual", label: "¿Está tomando algún medicamento actualmente?", type: "text", required: false }
    ];
    let medFieldsArr = data.medicalFormFields || (requiresMed && !data.id ? defaultMedQuestions : (requiresMed ? [] : []));
    if (requiresMed && medFieldsArr.length === 0 && !data.id) {
        medFieldsArr = defaultMedQuestions; // Fallback for new
    } else if (requiresMed && medFieldsArr.length === 0 && data.id && !data.medicalFormFields) {
        medFieldsArr = defaultMedQuestions; // Fallback for legacy items without fields
    }

    // Normalize in case old string format remains
    let fieldsToLoad = medFieldsArr.map((m, idx) => {
        if (typeof m === 'string') {
            return { key: "q_" + idx, label: m, type: "boolean", required: true };
        }
        return m;
    });
    populateMedicalQuestionsUI(fieldsToLoad);

    const incomp = data.incompatibleSameDayServices || [];
    incomp.forEach(id => {
        const check = document.getElementById(`incompat_${id}`);
        if (check) check.checked = true;
    });
}

// --- Tabs Logic ---
export function setupModalLogic() {
    // Top Close Button
    document.getElementById('closeModalBtn').addEventListener('click', closeServiceModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeServiceModal);

    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Array Add Buttons
    document.getElementById('addBenefit').addEventListener('click', () => addArrayItemUI('benefitsList'));
    document.getElementById('addRecommendation').addEventListener('click', () => addArrayItemUI('recommendationsList'));
    document.getElementById('addAftercare').addEventListener('click', () => addArrayItemUI('aftercareList'));
    document.getElementById('addContraindication').addEventListener('click', () => addArrayItemUI('contraindicationsList'));
    document.getElementById('addMedicalQuestion').addEventListener('click', () => addMedicalQuestionUI());

    // Med Form Toggle
    document.getElementById('requiresMedForm').addEventListener('change', (e) => {
        const group = document.getElementById('medicalQuestionsGroup');
        group.style.display = e.target.checked ? 'block' : 'none';
        if (e.target.checked && extractMedicalQuestionsData().length === 0) {
            const defs = [
                { key: "cirugia_reciente", label: "¿Ha tenido alguna cirugía en los últimos 3 meses?", type: "boolean", required: true },
                { key: "trombosis", label: "¿Tiene antecedentes de trombosis o coágulos?", type: "boolean", required: true },
                { key: "enfermedad_cardiaca", label: "¿Padece alguna enfermedad cardíaca?", type: "boolean", required: true },
                { key: "cancer_activo", label: "¿Actualmente tiene diagnóstico de cáncer activo?", type: "boolean", required: true },
                { key: "medicacion_actual", label: "¿Está tomando algún medicamento actualmente?", type: "text", required: false }
            ];
            populateMedicalQuestionsUI(defs);
        }
    });

    // Image Handlers
    document.getElementById('imgGalleryInput').addEventListener('change', handleGalleryFiles);

    // Preview Handlers for single images
    setupSingleImagePreview('imgMainInput', 'imgMainPreview');
    setupSingleImagePreview('imgIconInput', 'imgIconPreview');
    setupSingleImagePreview('imgBannerInput', 'imgBannerPreview');

    // Save Logic
    document.getElementById('saveServiceBtn').addEventListener('click', saveServiceToFirestore);

    // Initial setup for Arrays (Event Delegation for remove buttons)
    document.querySelectorAll('.array-list').forEach(list => {
        list.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove')) {
                e.target.closest('.array-item').remove();
            }
        });
    });
}

// --- Dynamic Arrays UI ---
function populateArrayUI(containerId, dataArray) {
    const list = document.getElementById(containerId);
    list.innerHTML = '';
    dataArray.forEach(val => {
        addArrayItemUI(containerId, val);
    });
}

function addArrayItemUI(containerId, value = "") {
    const list = document.getElementById(containerId);
    const div = document.createElement('div');
    div.className = 'array-item';
    div.innerHTML = `
        <input type="text" value="${value}">
        <button type="button" class="btn-remove">x</button>
    `;
    list.appendChild(div);
}

function extractArrayData(containerId) {
    const list = document.getElementById(containerId);
    const inputs = list.querySelectorAll('input[type="text"]');
    const result = [];
    inputs.forEach(input => {
        if (input.value.trim() !== '') {
            result.push(input.value.trim());
        }
    });
    return result;
}

// --- Dynamic Medical Questions UI ---
function populateMedicalQuestionsUI(dataArray) {
    const list = document.getElementById('medicalQuestionsList');
    list.innerHTML = '';
    dataArray.forEach(val => {
        addMedicalQuestionUI(val);
    });
}

function addMedicalQuestionUI(value = null) {
    const list = document.getElementById('medicalQuestionsList');
    const div = document.createElement('div');
    div.className = 'array-item medical-q-item';
    div.style.flexDirection = 'column';
    div.style.gap = '10px';
    div.style.background = '#f9fafb';
    div.style.padding = '15px';
    div.style.border = '1px solid #e5e7eb';
    div.style.borderRadius = '8px';
    div.style.position = 'relative';
    div.style.marginBottom = '10px';

    const ts = Date.now();
    const keyStr = value ? value.key : `q_${ts}`;
    const labelStr = value ? value.label : '';
    const typeStr = value ? value.type : 'boolean';
    const isRequired = value ? value.required === true : true; // Default true for new

    div.innerHTML = `
        <button type="button" class="btn-remove" style="position:absolute; top:10px; right:10px; background:#fee2e2; color:#dc2626; border:none; border-radius:6px; padding:2px 8px; cursor:pointer;">x</button>
        <div style="display:flex; flex-direction:column; gap:8px; margin-right:30px;">
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width:120px;">
                    <label style="font-size:0.8rem; color:#6b7280; display:block; margin-bottom:4px;">Key (ID Interno)</label>
                    <input type="text" class="med-q-key" value="${keyStr}" placeholder="ej: epilepsia" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px;">
                </div>
                <div style="flex:3; min-width:200px;">
                    <label style="font-size:0.8rem; color:#6b7280; display:block; margin-bottom:4px;">Pregunta (Label)</label>
                    <input type="text" class="med-q-label" value="${labelStr}" placeholder="¿Padece epilepsia?" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px;">
                </div>
            </div>
            <div style="display:flex; gap:15px; align-items:center; flex-wrap:wrap; margin-top:5px;">
                <div style="flex:1; min-width:150px;">
                    <label style="font-size:0.8rem; color:#6b7280; display:block; margin-bottom:4px;">Tipo de Respuesta</label>
                    <select class="med-q-type" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px; font-size:0.9rem;">
                        <option value="boolean" ${typeStr === 'boolean' ? 'selected' : ''}>Sí / No (Booleano)</option>
                        <option value="text" ${typeStr === 'text' ? 'selected' : ''}>Texto Libre</option>
                    </select>
                </div>
                <div style="flex:1; display:flex; align-items:center; gap:6px; min-width:150px;">
                    <input type="checkbox" class="med-q-required" id="req_${ts}_${keyStr}" ${isRequired ? 'checked' : ''}>
                    <label for="req_${ts}_${keyStr}" style="margin:0; font-size:0.9rem; font-weight:normal;">¿Pregunta Obligatoria?</label>
                </div>
            </div>
        </div>
    `;
    list.appendChild(div);
}

function extractMedicalQuestionsData() {
    const list = document.getElementById('medicalQuestionsList');
    const items = list.querySelectorAll('.medical-q-item');
    const result = [];
    items.forEach(item => {
        let key = item.querySelector('.med-q-key').value.trim();
        // Fallback key if empty
        if (!key) key = "q_" + Math.random().toString(36).substr(2, 9);
        const label = item.querySelector('.med-q-label').value.trim();
        const type = item.querySelector('.med-q-type').value;
        const required = item.querySelector('.med-q-required').checked;

        if (label !== '') {
            result.push({ key, label, type, required });
        }
    });
    return result;
}

// --- Images UI ---
function setupSingleImagePreview(inputId, previewId) {
    document.getElementById(inputId).addEventListener('change', function () {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const fit = previewId.includes('Icon') ? 'contain' : 'cover';
                document.getElementById(previewId).innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:${fit}; display:block;">`;
            }
            reader.readAsDataURL(file);
        }
    });
}

function handleGalleryFiles(e) {
    const files = Array.from(e.target.files);
    const maxAllowed = 6;
    const currentTotal = existingGalleryUrls.length + pendingGalleryFiles.length;

    if (currentTotal + files.length > maxAllowed) {
        alert(`Solo puedes tener un máximo de ${maxAllowed} imágenes de galería.`);
        e.target.value = ''; // Reset input
        return;
    }

    files.forEach(file => {
        pendingGalleryFiles.push(file);
    });

    // Reset input so they can add more file by file if they want
    e.target.value = '';
    renderGalleryPreviews();
}

function renderGalleryPreviews() {
    const grid = document.getElementById('galleryPreviewGrid');
    grid.innerHTML = '';

    // Render Existing URLs (allow removal)
    existingGalleryUrls.forEach((url, index) => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.innerHTML = `
            <img src="${url}" style="width:100%; height:100%; object-fit:cover; display:block;">
            <button class="remove-gallery-img" data-type="existing" data-idx="${index}">X</button>
        `;
        grid.appendChild(div);
    });

    // Render Pending Files (allow removal)
    pendingGalleryFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        const reader = new FileReader();
        reader.onload = function (e) {
            div.innerHTML = `
                <img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover; display:block; border: 2px solid #059669;">
                <button class="remove-gallery-img" data-type="pending" data-idx="${index}">X</button>
            `;
        }
        reader.readAsDataURL(file);
        grid.appendChild(div);
    });

    // Delegated event for removal
    grid.onclick = (e) => {
        if (e.target.classList.contains('remove-gallery-img')) {
            e.preventDefault();
            const type = e.target.getAttribute('data-type');
            const idx = parseInt(e.target.getAttribute('data-idx'));

            if (type === 'existing') {
                existingGalleryUrls.splice(idx, 1);
            } else {
                pendingGalleryFiles.splice(idx, 1);
            }
            renderGalleryPreviews();
        }
    };
}

// --- Save Action ---
async function saveServiceToFirestore() {
    const statusMsg = document.getElementById('modalStatusMsg');
    const saveBtn = document.getElementById('saveServiceBtn');

    // Validaciones básicas
    const nameInput = document.getElementById('serviceName').value.trim();
    if (!nameInput) {
        alert("El nombre es obligatorio");
        return;
    }

    let serviceId = currentEditingId;
    if (!isEditMode) {
        // Generate a URL-friendly ID based on name if new
        serviceId = nameInput.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        if (!serviceId) serviceId = `srv_${Date.now()} `;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    statusMsg.textContent = 'Recolectando datos...';

    try {
        const db = getFirebaseDb();

        // Extraer incompatibilidades
        const incompCheckboxes = document.querySelectorAll('#incompatibilitiesList input[type="checkbox"]:checked');
        const incompatibleSameDayServices = Array.from(incompCheckboxes).map(c => c.value);

        const reqMedForm = document.getElementById('requiresMedForm').checked;
        const formattedMedQuestions = extractMedicalQuestionsData();

        // Object payload
        const payload = {
            name: nameInput,
            isCategory: document.getElementById('isCategory').value === 'true',
            parentServiceId: document.getElementById('parentServiceId').value,
            durationMinutes: parseInt(document.getElementById('durationMinutes').value) || 60,
            capacity: parseInt(document.getElementById('capacity').value) || 1,
            order: parseInt(document.getElementById('order').value) || 1,
            active: document.getElementById('active').checked,

            description: document.getElementById('description').value.trim(),
            benefits: extractArrayData('benefitsList'),
            recommendations: extractArrayData('recommendationsList'),
            aftercare: extractArrayData('aftercareList'),
            contraindications: extractArrayData('contraindicationsList'),

            bookingRules: {
                maxPerDay: parseInt(document.getElementById('brMaxDaily').value) || 1,
                maxPerWeek: parseInt(document.getElementById('brMaxWeekly').value) || 2,
                maxPerMonth: parseInt(document.getElementById('brMaxMonthly').value) || 6,
                minAdvanceBookingHours: parseInt(document.getElementById('brMinHours').value) || 12,
                minDaysBetweenAppointments: parseInt(document.getElementById('brMinDaysBetween').value) || 0,
                maxActiveFutureAppointments: parseInt(document.getElementById('brMaxFuture').value) || 3
            },

            cancellationPolicy: {
                allowCancellation: document.getElementById('allowCancel').checked,
                allowReschedule: document.getElementById('allowReschedule').checked,
                minHoursBeforeAppointment: parseInt(document.getElementById('cancelMinHours').value) || 3
            },

            requiresDoctor: document.getElementById('requiresDoctor').checked,
            medicalConsentRequired: document.getElementById('requiresConsent').checked,
            requiresMedicalForm: reqMedForm,
            medicalFormFields: reqMedForm ? formattedMedQuestions : [],
            incompatibleSameDayServices: incompatibleSameDayServices,

            updatedAt: new Date()
        };



        if (!isEditMode) {
            payload.createdAt = new Date();
            // Initialize empty images structure
            payload.images = { main: "", icon: "", banner: "", gallery: [] };
        } else {
            // Keep existing images map intact, we will update it below
            payload.images = currentServiceData.images || { main: "", icon: "", banner: "", gallery: [] };
        }

        statusMsg.textContent = 'Actualizando Base de Datos...';
        const docRef = doc(db, 'services', serviceId);
        await setDoc(docRef, payload, { merge: true });

        // --- SUBIR IMAGENES SI HAY NUEVAS ---
        statusMsg.textContent = 'Subiendo imágenes (esto puede tardar)...';

        let newImagesData = { ...payload.images };
        let imageNeedsUpdate = false;

        const mainFile = document.getElementById('imgMainInput').files[0];
        if (mainFile) {
            newImagesData.main = await uploadServiceImage(mainFile, serviceId, 'main');
            imageNeedsUpdate = true;
        }

        const iconFile = document.getElementById('imgIconInput').files[0];
        if (iconFile) {
            newImagesData.icon = await uploadServiceImage(iconFile, serviceId, 'icon');
            imageNeedsUpdate = true;
        }

        const bannerFile = document.getElementById('imgBannerInput').files[0];
        if (bannerFile) {
            newImagesData.banner = await uploadServiceImage(bannerFile, serviceId, 'banner');
            imageNeedsUpdate = true;
        }

        // Para galería, tenemos `existingGalleryUrls` que pudo haber sido recortado por el usuario,
        // más los `pendingGalleryFiles` que hay que subir.
        let finalGalleryUrls = [...existingGalleryUrls];
        for (const file of pendingGalleryFiles) {
            const url = await uploadServiceImage(file, serviceId, 'gallery');
            finalGalleryUrls.push(url);
            imageNeedsUpdate = true;
        }

        // Si eliminó fotos existentes o subió nuevas, actualizamos.
        if (imageNeedsUpdate || existingGalleryUrls.length !== (payload.images.gallery || []).length) {
            newImagesData.gallery = finalGalleryUrls;
            await updateDoc(docRef, { images: newImagesData });
        }

        statusMsg.textContent = '¡Servicio guardado exitosamente!';

        // Recargar dashboard
        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error("Error guardando el servicio:", error);
        alert("Ocurrió un error al guardar: " + error.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Servicio';
        statusMsg.textContent = '';
    }
}
