import axios, { AxiosRequestConfig } from 'axios';
import { auth } from '../lib/firebase';

export const AXIOS_INSTANCE = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
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

export const apiClient = <T>(config: AxiosRequestConfig): Promise<T> =>
  AXIOS_INSTANCE(config).then(({ data }) => data);
