import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "cameraId";

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "cam-";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export async function getOrCreateCameraId(): Promise<string> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  if (saved) return saved;

  const newId = generateId();
  await AsyncStorage.setItem(STORAGE_KEY, newId);
  return newId;
}
