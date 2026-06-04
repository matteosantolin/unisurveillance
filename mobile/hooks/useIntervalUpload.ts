import { useEffect, useRef, useState } from "react";
import { CAPTURE_INTERVAL_MS } from "../constants/config";
import { uploadPhoto } from "../services/uploadService";

export type UploadStatus = "idle" | "capturing" | "uploading" | "success" | "error";

interface UseIntervalUploadOptions {
  cameraRef: React.RefObject<any>;
  serverUrl: string;
  cameraId: string;
  enabled: boolean;
}

interface UploadState {
  status: UploadStatus;
  lastPeopleCount: number | null;
  lastError: string | null;
  uploadCount: number;
}

export function useIntervalUpload({
  cameraRef,
  serverUrl,
  cameraId,
  enabled,
}: UseIntervalUploadOptions): UploadState {
  const [state, setState] = useState<UploadState>({
    status: "idle",
    lastPeopleCount: null,
    lastError: null,
    uploadCount: 0,
  });

  const isUploadingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setState((s) => (s.status === "idle" ? s : { ...s, status: "idle" }));
      return;
    }

    const tick = async () => {
      if (isUploadingRef.current) return;
      if (!cameraRef.current) return;
      if (!cameraId) return; // guard: cameraId non ancora caricato da AsyncStorage

      isUploadingRef.current = true;
      setState((s) => ({ ...s, status: "capturing" }));

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          base64: false,
        });

        setState((s) => ({ ...s, status: "uploading" }));

        const result = await uploadPhoto(photo.uri, serverUrl, cameraId);

        setState((s) => ({
          ...s,
          status: "success",
          lastPeopleCount: result.people_count ?? null,
          lastError: null,
          uploadCount: s.uploadCount + 1,
        }));
      } catch (err: any) {
        setState((s) => ({
          ...s,
          status: "error",
          lastError: err.message ?? "Errore sconosciuto",
        }));
      } finally {
        isUploadingRef.current = false;
      }
    };

    tick();
    const interval = setInterval(tick, CAPTURE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, serverUrl, cameraId]);

  return state;
}
