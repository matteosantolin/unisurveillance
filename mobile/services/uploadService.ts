import { auth } from "../firebase";

const UPLOAD_TIMEOUT_MS = 30000;

export interface UploadResult {
  success: boolean;
  people_count?: number;
  error?: string;
}

/**
 * Invia una foto al server Flask autenticata con Firebase ID token.
 *
 * Comportamento:
 *  - Estrae l'utente corrente; se assente lancia errore (sorveglianza non
 *    può partire senza login).
 *  - Allega `Authorization: Bearer <token>`; in caso di 401 forza un
 *    refresh del token e ritenta una sola volta.
 *  - Timeout configurato a 30s per assorbire i cold start di Cloud Run.
 */
export async function uploadPhoto(
  photoUri: string,
  serverUrl: string,
  cameraId: string
): Promise<UploadResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Utente non autenticato");
  }

  const send = async (forceRefresh: boolean): Promise<Response> => {
    const token = await user.getIdToken(forceRefresh);
    const formData = new FormData();
    formData.append("photo", {
      uri: photoUri,
      name: "photo.jpg",
      type: "image/jpeg",
    } as unknown as Blob);
    formData.append("camera_id", cameraId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      return await fetch(`${serverUrl}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Upload timeout dopo ${UPLOAD_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let response = await send(false);
  if (response.status === 401) {
    response = await send(true);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server ${response.status}: ${text}`);
  }

  return response.json();
}
