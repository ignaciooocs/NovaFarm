import { useEffect } from 'react';
import { create } from 'zustand';
import { getErrorMessage } from '@/lib/errors';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface Toast {
  // Distinto en cada aviso: el Snackbar se remonta con esta key. Montado el
  // mismo, un aviso nuevo heredaba el tiempo que le quedaba al anterior
  // (Paper solo arranca el temporizador al pasar a visible) — encontrado
  // probando el Anotador.
  id: string;
  message: string;
  duration: number;
  action?: ToastAction;
}

interface ToastState {
  // El aviso sigue guardado después de ocultarse, para que el Snackbar se
  // desvanezca con su texto en vez de vaciarse de golpe.
  toast: Toast | null;
  visible: boolean;
}

export const TOAST_SHORT_MS = 2500;
export const TOAST_LONG_MS = 4000;

export const useToastStore = create<ToastState>(() => ({
  toast: null,
  visible: false,
}));

let lastId = 0;

// Fuera del hook a propósito, como bootstrapConnectivityListener: así
// también puede avisar algo que no es un componente (lib/...), no solo una
// pantalla. Un aviso nuevo reemplaza al anterior — nunca se apilan, que es
// justo lo que hace ilegible un cartel en el campo.
// Devuelve el id del aviso, para quien después necesite bajar ese y no el
// que esté puesto en ese momento (ver hideToast y el Anotador).
export function showToast(
  message: string,
  options: { duration?: number; action?: ToastAction } = {},
): string {
  lastId += 1;
  const id = String(lastId);
  useToastStore.setState({
    toast: {
      id,
      message,
      duration: options.duration ?? TOAST_LONG_MS,
      action: options.action,
    },
    visible: true,
  });
  return id;
}

// El camino corto para un catch: traduce el error con el mismo
// getErrorMessage de siempre y lo muestra. Se usa para lo que falló al
// tocar algo; un error que deja la pantalla sin datos sigue yendo en el
// texto de la pantalla, porque tiene que quedarse ahí.
export function showErrorToast(error: unknown): void {
  showToast(getErrorMessage(error));
}

// Con un id, baja ese aviso solo si es el que está puesto — si ya lo
// reemplazó otro, no hace nada. Sin id, baja el que haya.
export function hideToast(id?: string): void {
  if (id && useToastStore.getState().toast?.id !== id) {
    return;
  }
  useToastStore.setState({ visible: false });
}

// Para los errores de React Query, que son estado y no un evento: muestra el
// aviso una sola vez, cuando el error aparece. La query conserva el mismo
// objeto de error entre renders, así que no se repite solo; si el refresco
// vuelve a fallar más tarde, el objeto es otro y el aviso sale de nuevo.
export function useErrorToast(error: unknown): void {
  useEffect(() => {
    if (error) {
      showErrorToast(error);
    }
  }, [error]);
}
