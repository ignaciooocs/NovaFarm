import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Button,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  productsControllerCreate,
  useProductsControllerFindAvailable,
} from '@/api/generated/products/products';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { useErrorToast, usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

// Se ofrecen solo los marcados `featured` en el catálogo de la app (ver
// product-catalog.ts en server-app): esta pantalla muestra todo junto en una
// grilla sin scroll, y el catálogo completo —unos cuarenta— no entra. Los que
// falten se agregan después desde Cultivos, que sí los muestra todos.
// Se suman recién al confirmar (POST /products con `productId`, una llamada
// por cultivo elegido; no hay variante bulk en server-app y con este puñado no
// vale la pena agregar una solo para esto, mismo criterio que la paginación
// de harvesters pospuesta).

// Último paso, opcional, del onboarding del admin — nunca lo ve un recorder
// que se une a un equipo existente (join-farm.tsx sigue yendo directo a
// /home, ese catálogo ya lo armó el admin del equipo al que se une). Mismo
// lenguaje visual que products.tsx (grilla 2 columnas, tile cuadrado, emoji al
// centro) pero de selección múltiple en vez de editar/activar — acá nada
// está creado todavía, tocar un tile solo lo marca para crear al confirmar.
// Sin header propio, igual que invite-code.tsx: no hay "volver" con sentido
// en un paso posterior a que la farm ya se creó.
export default function StarterProductsScreen() {
  const router = useRouter();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  // Los ids elegidos: el producto es global, así que su _id es la identidad
  // compartida entre todas las farms.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Sin useRefreshOnFocus: nada vuelve a esta pantalla (se sale con replace).
  // Si llega sin señal, la grilla se llena sola al reconectar — antes quedaba
  // vacía y solo quedaba Saltar.
  const availableQuery = useProductsControllerFindAvailable();
  const featured =
    availableQuery.data?.filter((product) => product.featured) ?? [];

  // Un POST por cultivo elegido, así que no calza con el hook generado (una
  // petición por mutación): useMutation propio sobre la función suelta, con
  // los mismos defaults de lib/queryClient.ts (sin reintentos, falla al tiro
  // sin señal).
  const addProducts = useMutation({
    mutationFn: (productIds: string[]) =>
      Promise.all(productIds.map(addProduct)),
    onSuccess: () => router.replace('/home'),
  });
  useErrorToast(addProducts.error ?? availableQuery.error);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleContinue() {
    addProducts.mutate([...selected]);
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.onboarding.starterProductsTitle}
      </Text>
      <Text style={styles.subtitle}>
        {strings.onboarding.starterProductsSubtitle}
      </Text>

      {availableQuery.isPending ? <ActivityIndicator /> : null}

      <ScrollView
        style={styles.productsScroll}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {featured.map((product) => {
          const isSelected = selected.has(product._id);

          return (
            <TouchableRipple
              key={product._id}
              onPress={() => toggle(product._id)}
              style={[styles.tile, isSelected && styles.tileSelected]}
            >
              <View style={styles.tileBody}>
                <Text style={styles.tileEmoji}>{product.icon}</Text>
                <Text style={styles.tileName}>{product.name}</Text>

                {isSelected ? (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color={palette.primary}
                    style={styles.tileCheck}
                  />
                ) : null}
              </View>
            </TouchableRipple>
          );
        })}
      </ScrollView>

      <Button
        mode="contained"
        onPress={handleContinue}
        loading={addProducts.isPending}
        disabled={selected.size === 0 || addProducts.isPending}
        buttonColor={palette.primary}
        contentStyle={styles.buttonContent}
        style={styles.button}
      >
        {strings.onboarding.starterProductsAddButton}
      </Button>
      <Button
        mode="text"
        onPress={() => router.replace('/home')}
        disabled={addProducts.isPending}
        textColor={colors.textSecondary}
      >
        {strings.common.skip}
      </Button>
    </Screen>
  );
}

// Si un intento anterior alcanzó a sumar algunos y falló en otro (la señal
// se corta a la mitad), reintentar vuelve a mandar todos y el server responde
// 409 por los que ya están. Eso es justo lo que se pedía, no un error: sin
// esto el reintento fallaba siempre y solo quedaba Saltar. Se matchea también
// el mensaje, no solo el 409 (mismo criterio que lib/errors.ts).
async function addProduct(productId: string): Promise<void> {
  try {
    await productsControllerCreate({ productId });
  } catch (err) {
    const message = isAxiosError(err)
      ? (err.response?.data as { message?: unknown } | undefined)?.message
      : undefined;
    const alreadyInCatalog =
      isAxiosError(err) &&
      err.response?.status === 409 &&
      typeof message === 'string' &&
      /already in the farm catalog/i.test(message);

    if (!alreadyInCatalog) {
      throw err;
    }
  }
}

function createStyles(palette: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    title: { marginBottom: spacing.xs },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 16,
      marginBottom: spacing.lg,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
    tile: {
      width: '44%',
      aspectRatio: 1,
      marginBottom: spacing.lg,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    tileSelected: {
      backgroundColor: palette.primarySoft,
      borderColor: palette.primary,
    },
    tileBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
    },
    tileEmoji: { fontSize: 40, marginBottom: spacing.xs },
    tileName: { fontWeight: 'bold', textAlign: 'center' },
    tileCheck: { position: 'absolute', top: spacing.xs, right: spacing.xs },
    buttonContent: { paddingVertical: spacing.xs },
    button: { borderRadius: 12, marginTop: spacing.sm },
    productsScroll: {
  flex: 1,
},
  });
}
