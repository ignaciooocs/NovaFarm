import axios, {
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  isAxiosError,
} from 'axios';
import { auth } from '../lib/firebase';

// Guarda cuándo salió la request para poder medir cuánto tardó al volver.
type TimedRequestConfig = InternalAxiosRequestConfig & { startedAt?: number };

// Sin `timeout`, axios espera indefinidamente si el server no responde (ej.
// la IP de LAN configurada en EXPO_PUBLIC_API_URL quedó vieja porque el
// router le asignó otra por DHCP) — un solo request colgado podía dejar
// pantallas enteras pegadas en su spinner de carga para siempre, sin que
// ningún try/catch lo salvara (la promesa nunca llega a resolver ni
// rechazar). 15s es generoso para una red de campo con señal mala, pero
// nunca "para siempre".
export const AXIOS_INSTANCE = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 15000,
});

// Adjunta el ID token de Firebase como Bearer en cada request — el resto de
// la app nunca arma este header a mano. Si no hay usuario logueado, la
// request sale sin Authorization (rutas públicas, como el registro).
AXIOS_INSTANCE.interceptors.request.use(async (config) => {
  const token = await auth.currentUser?.getIdToken();

  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }

  return config;
});

// Una línea por request en la consola de Metro, para ver qué sale realmente
// del dispositivo durante una sincronización sin instrumentar cada pantalla.
// Solo en desarrollo, y sin el body: los lotes de sync son enormes y traen
// datos personales del cosechador.
if (__DEV__) {
  const log = (config: AxiosRequestConfig, outcome: string) => {
    const startedAt = (config as TimedRequestConfig).startedAt;
    const elapsed = startedAt ? ` (${Date.now() - startedAt}ms)` : '';
    const method = config.method?.toUpperCase() ?? '?';

    console.log(`[api] ${method} ${config.url ?? '?'} → ${outcome}${elapsed}`);
  };

  AXIOS_INSTANCE.interceptors.request.use((config: TimedRequestConfig) => {
    config.startedAt = Date.now();
    return config;
  });

  AXIOS_INSTANCE.interceptors.response.use(
    (response) => {
      log(response.config, String(response.status));
      return response;
    },
    (error: unknown) => {
      if (isAxiosError(error) && error.config) {
        // Sin `response` la request nunca llegó al server (sin señal, IP de
        // LAN vieja, timeout) — distinguirlo de un 4xx/5xx es la mitad del
        // valor de tener este log en el campo.
        const outcome =
          error.response?.status.toString() ?? error.code ?? 'sin respuesta';

        log(error.config, outcome);
      }
      return Promise.reject(error);
    },
  );
}

export const apiClient = <T>(config: AxiosRequestConfig): Promise<T> =>
  AXIOS_INSTANCE(config).then(({ data }) => data);
