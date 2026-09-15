import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Button,
  Chip,
  Dialog,
  Divider,
  FAB,
  HelperText,
  IconButton,
  Portal,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';
import { useQueryClient } from '@tanstack/react-query';
import type { FindProductResponseDto } from '@/api/generated/novaFarmAPI.schemas';
import {
  getProductsControllerFindAllQueryKey,
  getProductsControllerFindAvailableQueryKey,
  useProductsControllerCreate,
  useProductsControllerFindAll,
  useProductsControllerFindAvailable,
  useProductsControllerUpdate,
} from '@/api/generated/products/products';
import { KeyboardAwareDialog } from '@/components/KeyboardAwareDialog';
import { Screen } from '@/components/Screen';
import { PRODUCT_ICON_OPTIONS } from '@/constants/productIcon';
import { strings } from '@/constants/strings';
import { syncCatalogs } from '@/lib/catalogSync';
import { getErrorMessage } from '@/lib/errors';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { usePalette } from '@/stores';
import { spacing } from '@/theme';

// Grilla de 2 columnas (RF-03.3 + pasada de UI/UX pedida por el usuario,
// 2026-09-03): cada cultivo es un ítem cuadrado con su emoji, sin cards ni
// relleno — ver "Preferencias de diseño" en ui-arquitectura.md, acá se
// interpreta como separación por espaciado en vez de una caja de fondo,
// igual que una grilla de íconos de apps. El ícono de ojo en la esquina es
// el toggle de activar/desactivar (sin diálogo, reversible).
//
// Dos orígenes conviven acá (ver product.schema.ts en server-app): los del
// catálogo de la app, que son la MISMA fila para todas las farms, y los que
// esta farm creó porque no estaban. Tocar un ítem abre el formulario solo si
// `editable`; si no, explica por qué no se puede.
export default function ProductsScreen() {
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const queryClient = useQueryClient();

  // Antes se pedía solo al montar, y como las pantallas del drawer quedan
  // montadas, volver acá mostraba el catálogo como estaba la primera vez.
  // Ahora se refresca en cada foco, con lo último visible mientras tanto.
  const productsQuery = useProductsControllerFindAll();
  // Lo que esta farm podría sumar: el catálogo de la app más lo que ella
  // misma creó, menos lo que ya tiene. Lo arma el server (ver
  // ProductsService.findAvailable) — acá no se filtra nada.
  const availableQuery = useProductsControllerFindAvailable();
  useRefreshOnFocus([productsQuery.queryKey, availableQuery.queryKey]);
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const available = availableQuery.data ?? [];

  // Las dos listas cambian juntas: sumar un cultivo lo saca de "disponibles"
  // y lo pone en la grilla.
  function invalidateProducts() {
    queryClient.invalidateQueries({
      queryKey: getProductsControllerFindAllQueryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: getProductsControllerFindAvailableQueryKey(),
    });
    // Y la caché local: Abrir Jornada lee los cultivos de SQLite antes de que
    // termine su propio sync, así que un cultivo recién creado o reactivado
    // acá no aparecía ahí la primera vez. Dedupeada y nunca lanza.
    syncCatalogs();
  }

  // Una mutación por flujo y no una compartida: cada una lleva su propio
  // "guardando" y su propio error. Con una sola, tocar el ojo de un cultivo
  // haría girar el botón Guardar del formulario, y el error de uno aparecería
  // en el otro.
  const createProduct = useProductsControllerCreate();
  const updateProduct = useProductsControllerUpdate();
  const toggleProduct = useProductsControllerUpdate();
  const addSuggestion = useProductsControllerCreate();

  const [dialogOpen, setDialogOpen] = useState(false);
  // null = creando un cultivo nuevo; con valor = editando ese (mismo diálogo
  // para ambos casos, ver openCreateDialog/openEditDialog).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  // Si el campo de emoji libre está desplegado. Se abre solo al editar un
  // cultivo cuyo emoji no está en el set (ver hasCustomIcon).
  const [customIconOpen, setCustomIconOpen] = useState(false);
  // Confirmar antes de agregar — un chip es fácil de tocar sin querer al lado
  // de la grilla real.
  const [confirmingSuggestion, setConfirmingSuggestion] =
    useState<FindProductResponseDto | null>(null);
  // Por qué un cultivo no se puede editar, cuando se toca uno bloqueado.
  const [lockedProduct, setLockedProduct] =
    useState<FindProductResponseDto | null>(null);

  const saving = createProduct.isPending || updateProduct.isPending;
  // El del formulario va debajo del nombre (casi siempre es el de nombre
  // duplicado); el resto, arriba de la grilla.
  const dialogError = createProduct.error ?? updateProduct.error;
  const screenError =
    productsQuery.error ??
    availableQuery.error ??
    toggleProduct.error ??
    addSuggestion.error;

  // FlatList con numColumns=2 + columnWrapperStyle "space-around": cuando la
  // última fila tiene un solo ítem (cantidad impar), ese ítem queda
  // centrado en su fila en vez de alineado bajo la primera columna — se ve
  // "flotando" en el medio en vez de ordenado. `null` de relleno ocupa la
  // segunda columna sin renderizar nada (ver renderItem), así la fila se
  // reparte igual que las anteriores y el último ítem real queda a la
  // izquierda.
  const gridData = useMemo<(FindProductResponseDto | null)[]>(
    () => (products.length % 2 === 0 ? products : [...products, null]),
    [products],
  );

  // El emoji actual está fuera del set fijo — o sea que salió del campo
  // libre, o venía así de antes de que existiera el set.
  const hasCustomIcon =
    icon.trim().length > 0 && !PRODUCT_ICON_OPTIONS.includes(icon.trim());

  // El error de un intento anterior no tiene por qué aparecer al abrir el
  // formulario de nuevo, ni quedarse mientras se corrige el nombre. Solo se
  // limpia la que falló: reset() sobre una mutación en curso la desengancha,
  // y su onSuccess (cerrar el formulario, refrescar la grilla) no correría.
  function resetDialogErrors() {
    if (createProduct.isError) {
      createProduct.reset();
    }
    if (updateProduct.isError) {
      updateProduct.reset();
    }
  }

  function openCreateDialog() {
    resetDialogErrors();
    setEditingId(null);
    setName('');
    // Sin ícono preseleccionado: la vista previa muestra un marcador neutro
    // hasta que el admin elija uno.
    setIcon('');
    setCustomIconOpen(false);
    setDialogOpen(true);
  }

  function openEditDialog(product: FindProductResponseDto) {
    resetDialogErrors();
    setEditingId(product._id);
    setName(product.name);
    setIcon(product.icon);
    // No hace falta abrirlo a mano: hasCustomIcon ya lo despliega si el
    // emoji guardado no está en el set.
    setCustomIconOpen(false);
    setDialogOpen(true);
  }

  // Al guardar, el formulario se cierra y la grilla se refresca por detrás —
  // antes volvía a pedir todo con el spinner, que tapaba la grilla un
  // instante después de cada guardado.
  function handleSubmit() {
    // Emoji en blanco = dejarlo como estaba al editar, o dejar que el
    // server aplique su propio default al crear — nunca se manda un string
    // vacío (el server lo rechaza con @IsNotEmpty igual que name).
    const trimmedIcon = icon.trim() || undefined;
    const onSuccess = () => {
      setDialogOpen(false);
      invalidateProducts();
    };
    if (editingId) {
      updateProduct.mutate(
        {
          productId: editingId,
          data: { name: name.trim(), icon: trimmedIcon },
        },
        { onSuccess },
      );
    } else {
      // Sin `productId`: nace como cultivo de la comunidad, visible solo
      // para esta farm hasta que se lo promueva al catálogo de la app.
      createProduct.mutate(
        { data: { name: name.trim(), icon: trimmedIcon } },
        { onSuccess },
      );
    }
  }

  // Desactivar/reactivar toca solo la selección de ESTA farm, nunca el
  // producto global — es como una farm deja de cosechar algo sin afectar a
  // nadie más ni perder sus jornadas pasadas. Reversible, así que va sin
  // diálogo de confirmación.
  function handleToggleActive(product: FindProductResponseDto) {
    toggleProduct.mutate(
      {
        productId: product._id,
        data: { active: !(product.active ?? true) },
      },
      { onSuccess: invalidateProducts },
    );
  }

  // Tocar un chip solo abre la confirmación — el alta real pasa acá, y no
  // abre el formulario de nombre+emoji: el cultivo ya existe en el catálogo,
  // sumarlo es un solo paso.
  function handleConfirmAddSuggestion() {
    if (!confirmingSuggestion) {
      return;
    }
    // Solo el id: el nombre y el emoji los pone el server desde el producto
    // global, así dos farms que suman el mismo cultivo quedan comparables.
    addSuggestion.mutate(
      { data: { productId: confirmingSuggestion._id } },
      {
        onSuccess: () => {
          setConfirmingSuggestion(null);
          invalidateProducts();
        },
      },
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      {screenError ? (
        <HelperText type="error">{getErrorMessage(screenError)}</HelperText>
      ) : null}

      {/* Solo la primera vez: después la grilla en caché se ve al tiro. */}
      {productsQuery.isPending || availableQuery.isPending ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={gridData}
          keyExtractor={(item, index) => item?._id ?? `placeholder-${index}`}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          ListHeaderComponent={
            <Text style={styles.sectionLabel}>
              {strings.admin.productsCatalogLabel}
            </Text>
          }
          ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
          // Lo de la farm primero, el catálogo de la app al final — como
          // footer del mismo FlatList en vez de un ScrollView aparte debajo:
          // dos scrolls compitiendo por altura en la misma columna sin una
          // de las dos acotada es justo lo que hacía que los chips se
          // estiraran a ocupar toda la pantalla (bug real, encontrado en el
          // celular). Envuelto y no scroll horizontal: el catálogo son unas
          // cuarenta entradas, y hacer swipe cuarenta veces para encontrar la
          // tuya no es buscar, es una condena.
          ListFooterComponent={
            available.length > 0 ? (
              <>
                <Divider style={styles.divider} />
                <Text style={styles.sectionLabel}>
                  {strings.admin.productCatalogLabel}
                </Text>
                <Text style={styles.catalogHelp}>
                  {strings.admin.productCatalogHelp}
                </Text>
                <View style={styles.suggestionsRow}>
                  {available.map((suggestion) => (
                    <Chip
                      key={suggestion._id}
                      onPress={() => setConfirmingSuggestion(suggestion)}
                      style={styles.suggestionChip}
                    >
                      {`${suggestion.icon} ${suggestion.name}`}
                    </Chip>
                  ))}
                </View>
              </>
            ) : null
          }
          renderItem={({ item }) => {
            if (item === null) {
              return <View style={styles.tilePlaceholder} />;
            }
            const isActive = item.active ?? true;
            return (
              <View style={styles.tile}>
                <Pressable
                  // Un cultivo bloqueado no abre el formulario: explica por
                  // qué no se puede, que es más útil que un diálogo con todo
                  // deshabilitado o, peor, que no pase nada al tocarlo.
                  onPress={() =>
                    item.editable
                      ? openEditDialog(item)
                      : setLockedProduct(item)
                  }
                  style={styles.tileBody}
                >
                  <View style={isActive ? undefined : styles.tileInactive}>
                    <Text style={styles.tileEmoji}>{item.icon}</Text>
                    <Text style={styles.tileName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {!isActive ? (
                      <Text style={styles.tileInactiveLabel}>
                        {strings.common.inactive}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>

                {toggleProduct.isPending &&
                toggleProduct.variables?.productId === item._id ? (
                  <ActivityIndicator size="small" style={styles.tileToggle} />
                ) : (
                  <IconButton
                    icon={isActive ? 'eye-off' : 'eye'}
                    size={18}
                    style={styles.tileToggle}
                    accessibilityLabel={
                      isActive
                        ? strings.common.deactivate
                        : strings.common.activate
                    }
                    onPress={() => handleToggleActive(item)}
                  />
                )}
              </View>
            );
          }}
        />
      )}

      <FAB icon="plus" style={styles.fab} onPress={openCreateDialog} />

      <Portal>
        {/* KeyboardAwareDialog y no Dialog pelado: este formulario tiene
            campos de texto y en iOS el teclado le tapaba la mitad de abajo.
            El porqué y los intentos que no funcionaron están en el
            componente. */}
        <KeyboardAwareDialog
          visible={dialogOpen}
          onDismiss={() => setDialogOpen(false)}
        >
          <Dialog.Title>
            {editingId
              ? strings.admin.editProduct
              : strings.admin.newProduct}
          </Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView
              contentContainerStyle={styles.dialogForm}
              keyboardShouldPersistTaps="handled"
            >
              {/* Vista previa: la misma tarjeta que va a quedar en la grilla,
                  no un emoji suelto al lado de un campo. Lo que se está
                  creando es un ítem del catálogo, así que se muestra como tal
                  mientras se arma. */}
              <View style={styles.preview}>
                {icon.trim() ? (
                  <Text style={styles.previewEmoji}>{icon.trim()}</Text>
                ) : (
                  // Sin ícono elegido NO se muestra el emoji de respaldo:
                  // ponerlo ahí hacía parecer que el cultivo ya era una
                  // manzana. Un marcador neutro deja claro que falta elegir.
                  // (Si se guarda igual sin elegir, el server aplica su propio
                  // DEFAULT_PRODUCT_ICON — no es obligatorio.)
                  <MaterialCommunityIcons
                    name="emoticon-outline"
                    size={44}
                    color={palette.disabled}
                  />
                )}
                <Text
                  style={[
                    styles.previewName,
                    !name.trim() && styles.previewNameEmpty,
                  ]}
                  numberOfLines={1}
                >
                  {name.trim() || strings.admin.productPreviewPlaceholder}
                </Text>
              </View>

              <TextInput
                label={strings.common.name}
                value={name}
                // Limpia el error al escribir: el caso típico es el choque de
                // nombre duplicado, y dejar el mensaje puesto mientras se
                // corrige el nombre hace parecer que sigue mal.
                onChangeText={(text) => {
                  setName(text);
                  resetDialogErrors();
                }}
                error={dialogError != null}
                style={styles.nameInput}
              />
              {/* Debajo del nombre y no al final del formulario: el error que
                  llega acá es casi siempre el de nombre duplicado, y al final
                  del área scrolleable se lo podía perder de vista. */}
              {dialogError ? (
                <HelperText type="error">
                  {getErrorMessage(dialogError)}
                </HelperText>
              ) : null}

              <Text style={styles.sectionLabel}>
                {strings.admin.productIconLabel}
              </Text>
              {/* Se toca, no se tipea: el campo de texto anterior obligaba a
                  cambiar al teclado de emoji y buscar a mano. */}
              <View style={styles.iconGrid}>
                {PRODUCT_ICON_OPTIONS.map((option) => {
                  const selected = icon.trim() === option;
                  return (
                    <TouchableRipple
                      key={option}
                      onPress={() => {
                        setIcon(option);
                        setCustomIconOpen(false);
                      }}
                      style={[
                        styles.iconOption,
                        selected && styles.iconOptionSelected,
                      ]}
                    >
                      <Text style={styles.iconOptionEmoji}>{option}</Text>
                    </TouchableRipple>
                  );
                })}

                {/* Escape del set fijo: la lista cubre lo que se cosecha acá,
                    pero no tiene por qué cubrir todo. Se marca como elegido
                    también cuando el cultivo ya traía un emoji de afuera del
                    set (editar no lo pierde). */}
                <TouchableRipple
                  accessibilityLabel={strings.admin.productCustomIcon}
                  onPress={() => {
                    // Limpia un preset elegido antes, así la vista previa y el
                    // campo arrancan del mismo estado (vacío) en vez de
                    // mostrar un emoji que el campo no contiene.
                    if (!hasCustomIcon) {
                      setIcon('');
                    }
                    setCustomIconOpen(true);
                  }}
                  style={[
                    styles.iconOption,
                    (customIconOpen || hasCustomIcon) &&
                      styles.iconOptionSelected,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="pencil-outline"
                    size={22}
                    color={palette.textSecondary}
                  />
                </TouchableRipple>
              </View>

              {customIconOpen || hasCustomIcon ? (
                <TextInput
                  label={strings.admin.productCustomIconLabel}
                  value={icon}
                  onChangeText={setIcon}
                  style={styles.customIconInput}
                  // Un emoji puede ser varios code points (piel, banderas,
                  // ZWJ), así que 8 y no 1 o 2.
                  maxLength={8}
                />
              ) : null}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDialogOpen(false)}>
              {strings.common.cancel}
            </Button>
            <Button
              onPress={handleSubmit}
              loading={saving}
              disabled={!name.trim() || saving}
            >
              {strings.common.save}
            </Button>
          </Dialog.Actions>
        </KeyboardAwareDialog>

        <Dialog
          visible={confirmingSuggestion !== null}
          onDismiss={() => setConfirmingSuggestion(null)}
        >
          <Dialog.Title>{strings.admin.addSuggestionTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>
              {confirmingSuggestion
                ? strings.admin.addSuggestionConfirm(
                    confirmingSuggestion.icon,
                    confirmingSuggestion.name,
                  )
                : ''}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmingSuggestion(null)}>
              {strings.common.cancel}
            </Button>
            <Button
              onPress={handleConfirmAddSuggestion}
              loading={addSuggestion.isPending}
            >
              {strings.common.add}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Por qué este cultivo no se edita. Sin input, así que Dialog pelado. */}
        <Dialog
          visible={lockedProduct !== null}
          onDismiss={() => setLockedProduct(null)}
        >
          <Dialog.Title>
            {lockedProduct
              ? `${lockedProduct.icon} ${lockedProduct.name}`
              : strings.admin.productLockedTitle}
          </Dialog.Title>
          <Dialog.Content>
            <Text>
              {lockedProduct?.source === 'APP'
                ? strings.admin.productLockedCatalog
                : strings.admin.productLockedInUse}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLockedProduct(null)}>
              {strings.common.close}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

// Función en vez de StyleSheet.create() estático: varios estilos usan el
// primary del tema activo (usePalette), así que deben recalcularse cuando el
// usuario cambia de tema en Ajustes.
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    sectionLabel: {
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      textTransform: 'uppercase',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    catalogHelp: { color: colors.textSecondary, marginBottom: spacing.sm },
    suggestionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      paddingBottom: spacing.lg,
    },
    suggestionChip: { backgroundColor: colors.primarySoft },
    divider: { marginVertical: spacing.md },
    gridRow: { justifyContent: 'space-around' },
    tile: {
      width: '44%',
      aspectRatio: 1,
      marginBottom: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      // Mismo tono suave (12% de opacidad) que ya usa el Drawer para su
      // ítem activo — ver `primarySoft` en usePalette(). Primera versión
      // llevaba además un borde sólido del color de marca; el usuario lo
      // sacó después de probarlo (2026-09-03) — el fondo solo se veía mejor.
      backgroundColor: colors.primarySoft,
      borderRadius: 20,
    },
    // Mismo tamaño que `tile` pero sin fondo/contenido — rellena la segunda
    // columna de una fila impar para que el último ítem real quede alineado
    // a la izquierda en vez de centrado (ver gridData más arriba).
    tilePlaceholder: {
      width: '44%',
      aspectRatio: 1,
      marginBottom: spacing.lg,
    },
    tileBody: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
    },
    tileEmoji: { fontSize: 48, textAlign: 'center', marginBottom: spacing.xs },
    tileName: {
      textAlign: 'center',
      paddingHorizontal: spacing.sm,
      fontWeight: 'bold',
    },
    tileInactive: { opacity: 0.4, alignItems: 'center' },
    tileInactiveLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    tileToggle: { position: 'absolute', top: spacing.xs, right: spacing.xs },
    fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },

    // --- Diálogo de crear/editar cultivo ---
    // Sin padding horizontal: Dialog.ScrollArea ya trae los mismos 24 que
    // Dialog.Content, agregarlos acá los duplicaría.
    dialogForm: { paddingBottom: spacing.md },
    // Deliberadamente el mismo lenguaje que un tile de la grilla
    // (primarySoft, radio 20, emoji grande sobre el nombre en negrita): lo
    // que se está armando es un ítem del catálogo, así que se previsualiza
    // igual a como va a quedar. Un poco más chico que el tile real porque
    // acá es referencia, no el contenido principal.
    preview: {
      alignSelf: 'center',
      width: 128,
      height: 128,
      borderRadius: 20,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.lg,
    },
    previewEmoji: { fontSize: 44, textAlign: 'center' },
    previewName: {
      marginTop: spacing.xs,
      textAlign: 'center',
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    previewNameEmpty: { fontWeight: 'normal', color: colors.textSecondary },
    nameInput: { marginBottom: spacing.md },
    // Grilla envuelta y no scroll horizontal: son doce, entran en dos filas
    // y verlas todas de una es justamente lo que hace que elegir sea un
    // toque en vez de una búsqueda.
    iconGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    iconOption: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    // El elegido se marca con el fondo de marca + borde, el mismo par que ya
    // distingue lo seleccionado en OptionSelector.
    iconOptionSelected: {
      backgroundColor: colors.primarySoft,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    iconOptionEmoji: { fontSize: 26 },
    customIconInput: { marginTop: spacing.sm },
  });
}
