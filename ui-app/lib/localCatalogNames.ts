import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { DEFAULT_PRODUCT_ICON } from '@/constants/productIcon';
import { db } from '@/db/client';
import { harvesters, products } from '@/db/schema';

export interface ProductInfo {
  name: string;
  icon: string;
}

// Las pantallas que muestran datos del server en vivo (Historial, Mi equipo,
// Inicio) resuelven los nombres contra la caché local de catálogos, no con
// otra petición: products/harvesters guardan el catálogo completo de la farm,
// activos e inactivos, y una jornada vieja puede apuntar a un cultivo que ya
// se desactivó.
//
// Síncronas a propósito (`.all()`, el driver es openDatabaseSync). Con React
// Query los datos del server ya están en caché al volver a una pantalla; si
// los nombres llegaran un render después, se vería un parpadeo de "..." o del
// id crudo antes del nombre — justo lo que la caché venía a evitar. Son
// tablas de decenas o pocos cientos de filas: leerlas en el render cuesta
// menos que un frame.

export function readProductsById(): Record<string, ProductInfo> {
  const byId: Record<string, ProductInfo> = {};
  db.select()
    .from(products)
    .all()
    .forEach((product) => {
      byId[product.id] = {
        name: product.name,
        icon: product.icon ?? DEFAULT_PRODUCT_ICON,
      };
    });
  return byId;
}

export function readHarvesterNamesById(): Record<string, string> {
  const byId: Record<string, string> = {};
  db.select()
    .from(harvesters)
    .all()
    .forEach((harvester) => {
      byId[harvester.id] = `${harvester.firstName} ${harvester.lastName}`;
    });
  return byId;
}

/**
 * Lee de la base local al montar (en el mismo render, sin estado vacío
 * intermedio) y de nuevo cada vez que la pantalla recupera el foco — el
 * catálogo pudo haberse sincronizado mientras la pantalla estaba abajo en el
 * stack.
 *
 * `read` tiene que ser estable (una función de módulo como readProductsById).
 */
export function useLocalRead<T>(read: () => T): T {
  const [value, setValue] = useState(read);
  // El primer foco es el mount, y ahí useState ya leyó.
  const firstFocusRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      setValue(read());
    }, [read]),
  );

  return value;
}
