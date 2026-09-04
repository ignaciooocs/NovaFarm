import axios, { AxiosRequestConfig } from 'axios';
import { auth } from '../lib/firebase';

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

export const apiClient = <T>(config: AxiosRequestConfig): Promise<T> =>
  AXIOS_INSTANCE(config).then(({ data }) => data);
