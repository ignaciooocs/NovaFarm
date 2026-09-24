import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { hashKey, useQueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * Vuelve a pedir las queries de una pantalla cada vez que recupera el foco.
 *
 * React Query no sabe nada de la navegación: en un stack, la pantalla de
 * abajo sigue montada, así que al volver a ella no hay "mount" que dispare
 * nada. Antes de React Query cada pantalla pedía en su useFocusEffect, y ese
 * comportamiento se perdería sin que nada falle a la vista — este hook lo
 * conserva. La diferencia es que ahora lo último que se trajo se ve al tiro
 * mientras se refresca por detrás, en vez de un spinner.
 *
 * Recibe las keys de *esta* pantalla (las que genera orval, ej.
 * getWorkdaysControllerFindAllQueryKey(params)) y no refresca todo lo activo:
 * las pantallas de más abajo del stack también tienen queries activas, y
 * refrescarlas en cada foco sería pedir de más por la señal del campo.
 *
 * Patrón de la guía de React Native de TanStack Query v5.
 */
export function useRefreshOnFocus(queryKeys: QueryKey[]): void {
  const queryClient = useQueryClient();
  // El primer foco es el mount, y ahí useQuery ya pidió solo.
  const firstFocusRef = useRef(true);
  // Las keys llegan como arrays nuevos en cada render; el hash es lo que
  // dice si de verdad cambiaron (el mismo que usa React Query por dentro).
  const keysHash = hashKey(queryKeys);

  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }

      queryKeys.forEach((queryKey) => {
        queryClient.refetchQueries({ queryKey, stale: true, type: 'active' });
      });
      // queryKeys va representado por keysHash: mismo contenido, misma key.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, keysHash]),
  );
}
