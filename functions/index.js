const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { getAuth } = require("firebase-admin/auth");
const { initializeApp } = require("firebase-admin/app");
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
