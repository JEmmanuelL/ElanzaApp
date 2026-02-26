import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getFirebaseStorage, getFirebaseDb } from "../../core/firebase/config.js";

/**
 * Sube una imagen a Firebase Storage y actualiza el documento del servicio en Firestore.
 * 
 * @param {File} file - El objeto File (imagen) seleccionado por el administrador.
 * @param {string} serviceId - El ID del servicio al que pertenece.
 * @param {string} imageType - 'icon', 'main', 'banner' o 'gallery'.
 * @returns {Promise<string>} - Retorna la URL pública de descarga de la imagen.
 */
export async function uploadServiceImage(file, serviceId, imageType) {
    if (!file || !serviceId || !imageType) {
        throw new Error("Faltan parámetros: file, serviceId o imageType");
    }

    const storage = getFirebaseStorage();
    const db = getFirebaseDb();
    const validTypes = ['icon', 'main', 'banner', 'gallery'];

    if (!validTypes.includes(imageType)) {
        throw new Error(`Tipo de imagen inválido. Use: ${validTypes.join(', ')}`);
    }

    // Generar un nombre único si es galería (ej: timestamp.webp), si es main o banner podemos usar el ID del servicio
    // porque solo habrá una imagen de cada tipo por servicio (o se sobrescribe).
    let fileName = `${serviceId}.webp`;
    let folderPath = `service-img-${imageType}`;

    if (imageType === 'gallery') {
        const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1E9);
        fileName = `${uniqueId}.webp`;
        folderPath = `service-gallery/${serviceId}`;
    }

    const storagePath = `${folderPath}/${fileName}`;
    const storageRef = ref(storage, storagePath);

    try {
        // 1. Subir el archivo físico a Storage
        // Nota recomendada: Para producción, podrías convertir el objeto File a webp usando Canvas
        // antes de enviarlo a esto método para ahorrar espacio. 
        // Por ahora, Storage guarda el archivo tal como viene.
        console.log(`Subiendo archivo a ${storagePath}...`);
        const snapshot = await uploadBytes(storageRef, file);

        // 2. Obtener la URL pública
        const downloadUrl = await getDownloadURL(snapshot.ref);
        console.log(`Subida exitosa. URL: ${downloadUrl}`);

        // 3. Actualizar Firestore
        const serviceRef = doc(db, "services", serviceId);

        if (imageType === 'gallery') {
            // Si es galería, añadimos al final del arreglo
            await updateDoc(serviceRef, {
                "images.gallery": arrayUnion(downloadUrl)
            });
        } else {
            // Si es main o banner, reemplazamos el string
            const updateField = `images.${imageType}`;
            await updateDoc(serviceRef, {
                [updateField]: downloadUrl
            });
        }

        return downloadUrl;

    } catch (error) {
        console.error("Error subiendo imagen al servicio:", error);
        throw error;
    }
}
