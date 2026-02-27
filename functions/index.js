const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { initializeApp, getApp } = require("firebase-admin/app");
const logger = require("firebase-functions/logger");

// Inicializa Firebase Admin para poder acceder a Firebase Auth
initializeApp();

/**
 * Función que se ejecuta cada vez que un documento de la colección 'users'
 * es creado, actualizado o eliminado.
 * Se encarga de sincronizar el campo `role` de Firestore con los Custom Claims de Firebase Auth.
 */
exports.syncUserRole = onDocumentWritten({ document: "users/{userId}", database: "elanza" }, async (event) => {
    const userId = event.params.userId;
    const documentSnap = event.data.after; // Datos después del cambio

    // Si el documento fue eliminado, podemos quitar todos los claims personalizados
    if (!documentSnap.exists) {
        logger.info(`Usuario ${userId} eliminado en Firestore. Quitando roles.`);
        try {
            await getAuth().setCustomUserClaims(userId, { role: null });
        } catch (error) {
            logger.error(`Error al quitar claims para ${userId}:`, error);
        }
        return null;
    }

    // Datos actuales del documento
    const data = documentSnap.data();
    const currentRole = data.role || "Usuario Inactivo"; // Rol por defecto si no tiene

    try {
        // Obtenemos el usuario de Firebase Auth
        const userRecord = await getAuth().getUser(userId);

        // Verificamos si el usuario ya tiene este claim y si es igual, para evitar escrituras innecesarias
        const customClaims = userRecord.customClaims || {};

        if (customClaims.role === currentRole) {
            logger.info(`El usuario ${userId} ya tiene el rol '${currentRole}'. No se requiere actualización.`);
            return null;
        }

        // Asignamos el nuevo Custom Claim al usuario en Authentication
        await getAuth().setCustomUserClaims(userId, { role: currentRole });
        logger.info(`Se asignó el rol '${currentRole}' al usuario ${userId} en Auth.`);

    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            logger.warn(`El usuario ${userId} no existe en Auth, pero se intentó actualizar su rol desde Firestore.`);
        } else {
            logger.error(`Error al actualizar Custom Claims para ${userId}:`, error);
        }
    }

    return null;
});

// Inicializamos la base de datos apuntando a "elanza"
const getDb = () => getFirestore(getApp(), "elanza");

/* ===================================================== */
/* ================= HELPER FUNCTIONS ================== */
/* ===================================================== */

function getWeekNumber(date) {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const pastDays = (date - firstDay) / 86400000;
    return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
}

async function validateBookingRules({ userId, service, startTime, db }) {
    if (!service.bookingRules) return;

    const rules = service.bookingRules;
    const startDate = startTime.toDate();

    const snapshot = await db.collection("appointments")
        .where("userId", "==", userId)
        .where("serviceId", "==", service.id)
        .where("status", "==", "scheduled")
        .get();

    const appointments = snapshot.docs.map(d => d.data());

    // maxPerDay
    if (rules.maxPerDay) {
        const count = appointments.filter(a => {
            const d = a.startTime.toDate();
            return d.toDateString() === startDate.toDateString();
        }).length;

        if (count >= rules.maxPerDay) {
            throw new HttpsError("failed-precondition", `Solo puede agendar este servicio ${rules.maxPerDay} vez/veces por día.`);
        }
    }

    // maxPerWeek
    if (rules.maxPerWeek) {
        const week = getWeekNumber(startDate);
        const count = appointments.filter(a => {
            const d = a.startTime.toDate();
            return getWeekNumber(d) === week;
        }).length;

        if (count >= rules.maxPerWeek) {
            throw new HttpsError("failed-precondition", `Máximo de citas por semana (${rules.maxPerWeek}) alcanzado para este servicio.`);
        }
    }

    // minDaysBetweenAppointments
    if (rules.minDaysBetweenAppointments) {
        for (const a of appointments) {
            const diffDays = Math.abs((startDate - a.startTime.toDate()) / (1000 * 60 * 60 * 24));
            if (diffDays < rules.minDaysBetweenAppointments) {
                throw new HttpsError("failed-precondition", `Debe dejar al menos ${rules.minDaysBetweenAppointments} días entre citas de este servicio.`);
            }
        }
    }
}

async function validateServiceCompatibility({ userId, service, startTime, db }) {
    if (!service.incompatibleSameDayServices || service.incompatibleSameDayServices.length === 0) return;

    const snapshot = await db.collection("appointments")
        .where("userId", "==", userId)
        .where("status", "==", "scheduled")
        .get();

    const sameDayAppointments = snapshot.docs.map(d => d.data())
        .filter(a => a.startTime.toDate().toDateString() === startTime.toDate().toDateString());

    for (const appt of sameDayAppointments) {
        if (service.incompatibleSameDayServices.includes(appt.serviceId)) {
            throw new HttpsError("failed-precondition", "Este servicio no puede combinarse el mismo día con otro servicio incompatible ya agendado.");
        }
    }
}

async function validateDoctorAvailability({ doctorId, startTime, endTime, db }) {
    const snapshot = await db.collection("appointments")
        .where("doctorId", "==", doctorId)
        .where("status", "==", "scheduled")
        .get();

    const appointments = snapshot.docs.map(d => d.data());

    for (const appt of appointments) {
        const existingStart = appt.startTime.toDate();
        const existingEnd = appt.endTime.toDate();

        const newStart = startTime.toDate();
        const newEnd = endTime.toDate();

        const overlap = newStart < existingEnd && newEnd > existingStart;
        if (overlap) {
            throw new HttpsError("already-exists", "El doctor seleccionado ya tiene una cita en este horario.");
        }
    }
}

function validateCancellation({ appointment, service }) {
    const policy = service.cancellationPolicy;

    if (!policy) return; // Si no hay política estricta, permitimos.

    if (policy.allowCancellation === false) {
        throw new HttpsError("failed-precondition", "Este servicio no permite cancelaciones.");
    }

    if (policy.minHoursBeforeAppointment) {
        const now = new Date();
        const diffHours = (appointment.startTime.toDate() - now) / (1000 * 60 * 60);

        if (diffHours < policy.minHoursBeforeAppointment) {
            throw new HttpsError("failed-precondition", `Ya no es posible cancelar esta cita. Debe hacerse con al menos ${policy.minHoursBeforeAppointment} horas de anticipación.`);
        }
    }
}

/* ===================================================== */
/* ================= PUBLIC FUNCTIONS ================== */
/* ===================================================== */

exports.createAppointment = onCall(async (request) => {
    const auth = request.auth;
    if (!auth || !auth.uid) {
        throw new HttpsError("unauthenticated", "Debes iniciar sesión para agendar una cita.");
    }

    const { serviceId, doctorId, startTime } = request.data;
    if (!serviceId || !doctorId || !startTime) {
        throw new HttpsError("invalid-argument", "Faltan parámetros requeridos (serviceId, doctorId, startTime).");
    }

    const userId = auth.uid;
    const db = getDb();

    try {
        const serviceDoc = await db.collection("services").doc(serviceId).get();
        if (!serviceDoc.exists) {
            throw new HttpsError("not-found", "Servicio no encontrado.");
        }

        const service = { id: serviceDoc.id, ...serviceDoc.data() };
        const durationMs = (service.durationMinutes || 60) * 60 * 1000;

        const startTimestamp = Timestamp.fromDate(new Date(startTime));
        const endTimestamp = Timestamp.fromDate(new Date(new Date(startTime).getTime() + durationMs));

        // Validaciones
        await validateDoctorAvailability({ doctorId, startTime: startTimestamp, endTime: endTimestamp, db });
        await validateBookingRules({ userId, service, startTime: startTimestamp, db });
        await validateServiceCompatibility({ userId, service, startTime: startTimestamp, db });

        // Guardar cita
        const newAppointmentRef = await db.collection("appointments").add({
            userId,
            doctorId,
            serviceId,
            startTime: startTimestamp,
            endTime: endTimestamp,
            status: "scheduled",
            createdAt: FieldValue.serverTimestamp()
        });

        return { success: true, appointmentId: newAppointmentRef.id };
    } catch (error) {
        logger.error("Error en createAppointment:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Error interno al crear la cita.", error.message);
    }
});

exports.cancelAppointment = onCall(async (request) => {
    const auth = request.auth;
    if (!auth || !auth.uid) {
        throw new HttpsError("unauthenticated", "Debes iniciar sesión para cancelar una cita.");
    }

    const { appointmentId } = request.data;
    if (!appointmentId) {
        throw new HttpsError("invalid-argument", "Se requiere el ID de la cita.");
    }

    const userId = auth.uid;
    const db = getDb();

    try {
        const apptDoc = await db.collection("appointments").doc(appointmentId).get();
        if (!apptDoc.exists) {
            throw new HttpsError("not-found", "Cita no encontrada.");
        }

        const appointment = apptDoc.data();
        if (appointment.userId !== userId) {
            // Verificar si es super admin o admin que puede cancelar citas de otros
            if (auth.token.role !== "Super Administrador" && auth.token.role !== "Administrador") {
                throw new HttpsError("permission-denied", "No tienes permiso para cancelar esta cita.");
            }
        }

        if (appointment.status === "cancelled") {
            throw new HttpsError("failed-precondition", "La cita ya se encuentra cancelada.");
        }

        const serviceDoc = await db.collection("services").doc(appointment.serviceId).get();
        if (serviceDoc.exists) {
            const service = serviceDoc.data();
            // Solo validamos las reglas de cancelación si es el usuario quien cancela
            // Si es admin/superadmin, le permitimos saltarse la regla
            if (appointment.userId === userId && auth.token.role !== "Super Administrador" && auth.token.role !== "Administrador") {
                validateCancellation({ appointment, service });
            }
        }

        await apptDoc.ref.update({
            status: "cancelled",
            cancelledAt: FieldValue.serverTimestamp(),
            cancelledBy: userId
        });

        return { success: true };
    } catch (error) {
        logger.error("Error en cancelAppointment:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Error interno al cancelar la cita.", error.message);
    }
});

/**
 * Función trigger para gestionar el límite de almacenamiento de fotos clínicas (Storage TTL / FIFO)
 * Ejecutada cada que se añade una nueva cita al historial de un tratamiento.
 */
exports.manageClinicalHistoryLimitation = onDocumentCreated({
    document: "userPackages/{packageId}/appointmentsHistory/{apptId}",
    database: "elanza"
}, async (event) => {

    const db = getDb();
    const packageId = event.params.packageId;
    const newAppt = event.data.data();

    if (!newAppt.photos || newAppt.photos.length === 0) {
        return null; // Si no hay fotos nuevas, no hacemos chequeos costosos
    }

    try {
        // Obtenemos tooooodo el historial de este tratamiento (package) ordenado por fecha DESCENDENTE
        const apptsHistoryRef = db.collection(`userPackages/${packageId}/appointmentsHistory`);
        const snapshot = await apptsHistoryRef.orderBy("timestamp", "desc").get();

        let allAppts = [];
        snapshot.forEach(doc => {
            allAppts.push({ id: doc.id, ...doc.data() });
        });

        // 1. LIMITE DE 20 CITAS REGISTRADAS
        if (allAppts.length > 20) {
            // Borraremos los textos/documentos que excedan 20 (del más viejo al nuevo)
            const excedentes = allAppts.slice(20);
            // Promesas de borrado de Docs y sus fotos si existen (doble limpieza)
            const deletePromises = excedentes.map(async (oldDoc) => {
                if (oldDoc.photos && oldDoc.photos.length > 0) {
                    await deleteArrayOfStoragePhotos(oldDoc.photos);
                }
                return apptsHistoryRef.doc(oldDoc.id).delete();
            });
            await Promise.all(deletePromises);

            // Actualizamos la lista local después de borrar documentos base enteros
            allAppts = allAppts.slice(0, 20);
        }

        // 2. LÍMITE DE 8 FOTOS POR TRATAMIENTO (FIFO)
        let totalPhotosCount = 0;
        let photosToDelete = [];

        // Como están ordenadas por de más nuevas a viejas, las primeras se "salvan" 
        for (const appt of allAppts) {
            if (appt.photos && Array.isArray(appt.photos)) {

                const keptPhotos = []; // Las que sobreviven en esta cita
                const removedPhotos = []; // Las que pierden su lugar

                for (const photoUrl of appt.photos) {
                    if (totalPhotosCount < 8) {
                        totalPhotosCount++;
                        keptPhotos.push(photoUrl);
                    } else {
                        // Excedió el límite MAX (8), las siguientes empiezan en la "lista negra"
                        removedPhotos.push(photoUrl);
                        photosToDelete.push(photoUrl);
                    }
                }

                // Si de esta cita X algunas fotos cayeron en lista negra, actualizamos la Base de Datos
                if (removedPhotos.length > 0) {
                    await apptsHistoryRef.doc(appt.id).update({
                        photos: keptPhotos // Conserva array re-calculado
                    });
                    logger.info(`Se depuraron ${removedPhotos.length} fotos antiguas de la cita ${appt.id}`);
                }
            }
        }

        // Ejecutar la eliminación física desde el Storage (Ahorro Capa Gratuita)
        if (photosToDelete.length > 0) {
            await deleteArrayOfStoragePhotos(photosToDelete);
            logger.info(`[STORAGE CLEANUP] Se borraron ${photosToDelete.length} archivos físicos.`);
        }

    } catch (e) {
        logger.error(`Error en manageClinicalHistoryLimitation para package ${packageId}: `, e);
    }
});

/**
 * Función helper pura (Backend) para eliminar N URLs de firebase Storage 
 */
async function deleteArrayOfStoragePhotos(urlsArray) {
    const { getStorage } = require("firebase-admin/storage");
    const bucket = getStorage().bucket("elanza-91a64.appspot.com");

    const deletePromises = urlsArray.map(async (url) => {
        try {
            // La URL suele ser algo como "https://firebasestorage.../v0/b/bucket/o/carpeta%2Ffoto..."
            // Hay que extraer el 'path' real del archivo
            const urlObj = new URL(url);
            let filePath = decodeURIComponent(urlObj.pathname);
            // filePath se lee /v0/b/elanza-xxxx.appspot.com/o/history/user1/foto.png
            const parts = filePath.split('/o/');
            if (parts.length > 1) {
                const storagePath = parts[1];
                const file = bucket.file(storagePath);
                await file.delete();
            }
        } catch (err) {
            logger.warn(`No se pudo eliminar la foto del storage ${url}`, err);
        }
    });

    await Promise.allSettled(deletePromises);
}
