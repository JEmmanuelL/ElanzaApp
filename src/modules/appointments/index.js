import { getFirestore, collection, doc, getDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { getFirebaseDb, getFirebaseFunctions } from "../../core/firebase/config.js";

/**
 * Obtiene los horarios disponibles para un servicio y doctor en una fecha específica.
 * Esta lógica se ejecuta en el frontend (Client-side) para evitar llamadas constantes a Cloud Functions
 * y ahorrar costos.
 *
 * @param {Object} params
 * @param {string} params.doctorId ID del doctor
 * @param {string} params.date Fecha en formato 'YYYY-MM-DD' o un objeto Date
 * @param {string} params.serviceId ID del servicio a agendar
 * @returns {Promise<Date[]>} Arreglo de fechas (Date) que representan los slots disponibles.
 */
export async function getAvailableSlots({ doctorId, date, serviceId }) {
    const db = getFirebaseDb();

    try {
        // 1. Obtener la duración del servicio
        const serviceDocRef = doc(db, "services", serviceId);
        const serviceSnap = await getDoc(serviceDocRef);

        if (!serviceSnap.exists()) {
            throw new Error("Servicio no encontrado");
        }

        const service = serviceSnap.data();
        // Asume 60 minutos por defecto si no está definido
        const durationMs = (service.durationMinutes || 60) * 60 * 1000;

        // 2. Obtener el horario semanal base del doctor
        const scheduleDocRef = doc(db, "doctorSchedules", doctorId);
        const scheduleSnap = await getDoc(scheduleDocRef);

        if (!scheduleSnap.exists()) {
            console.warn(`No se encontró horario para el doctor ${doctorId}`);
            return []; // El doctor no tiene horario
        }

        const schedule = scheduleSnap.data().weeklySchedule || {};

        // 3. Determinar el día de la semana para la fecha solicitada
        // Convertir la fecha a un objeto Date local tratando el string YYYY-MM-DD
        const targetDate = new Date(date);

        // Obtener nombre del día en inglés minúsculas (ej: 'monday', 'tuesday')
        const dayName = targetDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

        // Obtener los slots predefinidos del doctor para ese día
        // Formato esperado: ["09:00", "10:30", "12:00", ...]
        const slotsForDay = schedule[dayName] || [];

        // 4. Obtener las citas ya agendadas de este doctor
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const appointmentsRef = collection(db, "appointments");

        // Query para traer todas las citas del doctor que estén 'scheduled'
        // En una app más robusta podrías filtrar por fecha también si configuras un índice:
        // .where("startTime", ">=", startOfDay).where("startTime", "<=", endOfDay)
        // Por simplicidad para evitar índices complejos iniciales si el volumen es bajo, 
        // traemos las del doctor y filtramos abajo, o creamos el query básico:
        const q = query(
            appointmentsRef,
            where("doctorId", "==", doctorId),
            where("status", "==", "scheduled")
        );

        const appointmentsSnapshot = await getDocs(q);
        const allDoctorAppointments = appointmentsSnapshot.docs.map(d => d.data());

        // 5. Calcular la disponibilidad
        const availableSlots = [];

        for (const hourStr of slotsForDay) {
            // hourStr = "09:00"
            const [h, m] = hourStr.split(":").map(Number);

            const prospectiveStart = new Date(targetDate);
            prospectiveStart.setHours(h, m, 0, 0);

            const prospectiveEnd = new Date(prospectiveStart.getTime() + durationMs);

            // Verificar si hay alguna cita agendada que se cruce
            const isOverlap = allDoctorAppointments.some(appt => {
                // Asumimos que appt.startTime y appt.endTime son Timestamps de Firestore
                const apptStart = appt.startTime.toDate();
                const apptEnd = appt.endTime.toDate();

                // Lógica de solapamiento: (NuevoInicio < FinExistente) AND (NuevoFin > InicioExistente)
                return prospectiveStart < apptEnd && prospectiveEnd > apptStart;
            });

            // Si además queremos validar que el slot no esté en el pasado (para hoy)
            const isPast = prospectiveStart < new Date();

            if (!isOverlap && !isPast) {
                availableSlots.push(prospectiveStart);
            }
        }

        return availableSlots;

    } catch (error) {
        console.error("Error al obtener disponibilidad:", error);
        throw error;
    }
}

/**
 * Llama a la Cloud Function 'createAppointment' para agendar una cita de manera segura.
 * 
 * @param {Object} data
 * @param {string} data.serviceId
 * @param {string} data.doctorId
 * @param {string} data.startTime ISO String o Date valid representable
 * @returns {Promise<Object>} Resultado con el success y appointmentId
 */
export async function bookAppointment(data) {
    const functions = getFirebaseFunctions();
    const createAppointmentFn = httpsCallable(functions, 'createAppointment');

    try {
        const result = await createAppointmentFn(data);
        return result.data;
    } catch (error) {
        console.error("Error al crear cita:", error);
        throw error;
    }
}

/**
 * Llama a la Cloud Function 'cancelAppointment' para cancelar una cita.
 * 
 * @param {string} appointmentId 
 * @returns {Promise<Object>} Resultado con success
 */
export async function cancelServiceAppointment(appointmentId) {
    const functions = getFirebaseFunctions();
    const cancelAppointmentFn = httpsCallable(functions, 'cancelAppointment');

    try {
        const result = await cancelAppointmentFn({ appointmentId });
        return result.data;
    } catch (error) {
        console.error("Error al cancelar cita:", error);
        throw error;
    }
}
