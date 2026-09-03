import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
// getReactNativePersistence existe en runtime (Metro resuelve la condición
// de exports "react-native" de @firebase/auth correctamente), pero el mapa
// de exports de ese paquete pone "types" antes que "react-native" a nivel de
// hermano — TypeScript se queda con esos types genéricos y nunca llega a ver
// la variante react-native, aunque el JS bundleado sí la tiene. Limitación
// conocida del SDK, no un error real.
// @ts-expect-error — ver comentario arriba.
import { getReactNativePersistence } from '@firebase/auth';

// Config pública de Firebase — no es secreta por diseño (identifica el
// proyecto, no autoriza nada por sí sola), por eso vive en variables
// EXPO_PUBLIC_* (expuestas al bundle del cliente, convención nativa de Expo).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Persistencia en AsyncStorage: la sesión sobrevive a que se cierre la app,
// que es justo lo que permite "login online, uso offline" (CLAUDE.md) — el
// login es la única acción que requiere conexión, después el token
// persistido alcanza para todo lo demás.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
