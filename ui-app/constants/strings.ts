// Copy de la app, agrupado por pantalla/dominio. Ninguna pantalla debería
// tener un string en español hardcodeado — todo se lee de acá, así se puede
// ajustar la terminología de campo ("Anotar", "Tarro", "Vuelta" — RNF-02) en
// un solo lugar sin tener que buscarla pantalla por pantalla.
//
// No es una librería de i18n completa (react-i18next, etc.) a propósito: la
// app tiene un solo idioma de destino, así que un objeto de constantes es
// suficiente y no agrega una dependencia ni una capa de indirección de más.

import { formatKg } from '@/lib/format';
import { APP_NAME } from './appName';

export const strings = {
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    continue: 'Continuar',
    delete: 'Eliminar',
    edit: 'Editar',
    add: 'Agregar',
    close: 'Cerrar',
    activate: 'Activar',
    deactivate: 'Desactivar',
    name: 'Nombre',
    loading: 'Cargando...',
    retry: 'Reintentar',
    error: 'Ocurrió un error',
    inactive: 'Inactivo',
    skip: 'Omitir',
    copy: 'Copiar',
  },
  auth: {
    brand: APP_NAME,
    loginTitle: 'Iniciar sesión',
    signupTitle: 'Crear cuenta',
    email: 'Correo electrónico',
    password: 'Contraseña',
    confirmPassword: 'Confirmar contraseña',
    passwordMismatch: 'Las contraseñas no coinciden',
    loginSubtitle: 'Inicia sesión para continuar',
    signupSubtitle: 'Crea tu cuenta para empezar',
    loginButton: 'Iniciar sesión',
    signupButton: 'Registrarme',
    noAccount: '¿No tienes cuenta? Regístrate',
    hasAccount: '¿Ya tienes cuenta? Inicia sesión',
  },
  onboarding: {
    roleQuestion: `¿Cómo vas a usar ${APP_NAME}?`,
    // Título corto (fila del selector) + texto completo original (queda
    // como descripción debajo) — mismo ajuste que farmType* de abajo.
    roleAdminShort: 'Administrador',
    roleAdmin: 'Administro un equipo o trabajo de forma independiente',
    roleRecorderShort: 'Anotador',
    roleRecorder: 'Voy a anotar cosechas de un equipo existente',
    nameLabel: 'Tu nombre',
    farmNameLabel: 'Nombre de tu farm',
    createFarmTitle: 'Crea tu farm',
    createFarmSubtitle: 'Completa los datos para empezar',
    farmTypeQuestion: '¿Cómo la vas a usar?',
    // Título corto (cabe en una fila) + descripción (el texto largo
    // original, ahora con todo el ancho de la pantalla para leerse bien —
    // antes vivían solos dentro de un SegmentedButtons de 2 columnas, sin
    // espacio para el texto completo).
    farmTypeOrganizationShort: 'Para mi equipo',
    farmTypeOrganization: 'Crear farm para mi equipo',
    farmTypeIndependentShort: 'Independiente',
    farmTypeIndependent: 'Trabajar de forma independiente',
    createFarmButton: 'Crear farm',
    invitationCodeTitle: '¡Tu farm está lista!',
    invitationCodeLabel: 'Código de invitación',
    invitationCodeShare: 'Comparte este código con tu equipo para que se unan',
    shareButton: 'Compartir código',
    shareMessage: (code: string) =>
      `Únete a mi equipo en ${APP_NAME} con el código: ${code}`,
    joinFarmTitle: 'Unirme a una farm',
    joinFarmSubtitle: 'Ingresa el código que te compartió tu equipo',
    joinFarmButton: 'Unirme',
    starterProductsTitle: 'Arma tu catálogo',
    starterProductsSubtitle:
      'Elige los cultivos con los que trabajas — puedes agregar más después desde Cultivos.',
    starterProductsAddButton: 'Agregar y continuar',
  },
  home: {
    title: 'Inicio',
    openWorkday: 'Abrir Jornada',
    activeWorkday: 'Jornada activa',
    goToAnotador: 'Ir al Anotador',
    history: 'Historial de jornadas',
    noActiveWorkday: 'No tienes una jornada abierta',
    supervisorEmptyState:
      'Como supervisor, revisá "Mi equipo" para ver el progreso de la cosecha.',
    todayTeam: 'Equipo de hoy',
    workersCount: (n: number) =>
      n === 1 ? '1 cosechador trabajando hoy' : `${n} cosechadores trabajando hoy`,
    moreWorkers: (n: number) => `+${n} más`,
    teamActiveNow: 'Equipo activo ahora',
  },
  workday: {
    openTitle: 'Abrir Jornada',
    date: 'Fecha',
    product: 'Cultivo',
    measurementUnit: 'Envase / Unidad de medida',
    open: 'Abrir',
    catalogUnavailableTitle: 'Falta descargar el catálogo',
    catalogUnavailableHelp:
      'Este dispositivo todavía no descargó los cultivos y unidades de tu farm. Conéctate una vez y vuelve a intentar — después vas a poder abrir jornadas sin señal.',
    closeTitle: 'Cerrar Jornada',
    closeConfirm: 'Al cerrar, los totales del día quedan congelados y ya no se pueden agregar más entregas.',
    close: 'Cerrar Jornada',
    totalKg: 'Total del día',
    pendingBeforeClose: (count: number) =>
      count === 1
        ? 'Tienes 1 registro sin sincronizar. Sincroniza antes de cerrar, o el total va a quedar incompleto.'
        : `Tienes ${count} registros sin sincronizar. Sincroniza antes de cerrar, o el total va a quedar incompleto.`,
  },
  history: {
    team: 'Equipo',
    workersCount: (n: number) => (n === 1 ? '1 cosechador' : `${n} cosechadores`),
    recordedBy: (name: string) => `Anotado por ${name}`,
    openLabel: 'Jornada en curso',
    syncedSoFar: 'Total sincronizado hasta ahora',
    pdfHarvesterColumn: 'Cosechador',
    pdfCountColumn: 'Envases',
    pdfKgColumn: 'Kg',
    pdfEmptyRoster: 'Sin cosechadores registrados.',
  },
  anotador: {
    title: 'Anotador',
    tapToRecord: 'Anotar',
    addHarvester: 'Agregar cosechador',
    searchHarvester: 'Buscar o escribir nombre nuevo',
    newHarvester: 'Registrar nuevo cosechador',
    registerAsNew: (name: string) => `+ Registrar "${name}" como nuevo`,
    total: 'Total',
    // "Envases", no "unidades": desde que el modo de la unidad es explícito
    // esto siempre cuenta envases (2 tarros, 1 capacho), nunca kilos.
    containers: (n: number) => (n === 1 ? '1 envase' : `${n} envases`),
    kg: 'kg',
    weightLabel: 'Peso (kg)',
    weightHelp: 'Como lo marca la romana, con un decimal (ej. 22,1)',
    recordWeight: 'Anotar peso',
    addWeight: 'Sumar',
    discountWeight: 'Descontar',
    grandTotal: 'Total del día',
    roundsTitle: 'Vueltas',
    round: (n: number) => `Vuelta ${n}`,
    noRoundsYet: 'Todavía no tiene vueltas anotadas.',
  },
  sync: {
    title: 'Sincronizar',
    subtitle: 'Sube lo que anotaste sin conexión.',
    pendingCount: (count: number) =>
      count === 1 ? '1 anotación pendiente de subir' : `${count} anotaciones pendientes de subir`,
    synced: 'Todo sincronizado',
    syncedHelp: 'No queda nada pendiente por subir.',
    pendingSectionTitle: 'Pendiente de sincronizar',
    pendingWorkday: 'La jornada (abierta sin conexión)',
    pendingHarvesters: (n: number) =>
      n === 1 ? '1 cosechador nuevo' : `${n} cosechadores nuevos`,
    pendingRoster: (n: number) =>
      n === 1
        ? '1 cosechador agregado a la jornada'
        : `${n} cosechadores agregados a la jornada`,
    pendingEntries: (n: number) =>
      n === 1 ? '1 anotación' : `${n} anotaciones`,
    syncButton: 'Sincronizar Jornada',
    syncing: 'Sincronizando...',
    rejectedItems: 'No se pudieron subir algunos registros',
  },
  admin: {
    productsTitle: 'Cultivos',
    measurementUnitsTitle: 'Unidades de medida',
    harvestersTitle: 'Cosechadores',
    teamTitle: 'Mi equipo',
    newProduct: 'Nuevo cultivo',
    newMeasurementUnit: 'Nueva unidad',
    newHarvester: 'Nuevo cosechador',
    editProduct: 'Editar cultivo',
    editMeasurementUnit: 'Editar unidad',
    editHarvester: 'Editar cosechador',
    roleAdmin: 'Admin',
    roleRecorder: 'Anotador',
    roleSupervisor: 'Supervisor',
    manageRoles: 'Editar roles',
    manageRolesTitle: (name: string) => `Roles de ${name}`,
    manageRolesEmpty: 'Selecciona al menos un rol.',
    manageRolesAdminNote: 'Además de administrador, ¿qué otros roles tiene?',
    productIconLabel: 'Ícono',
    productCustomIcon: 'Otro ícono',
    productCustomIconLabel: 'Escribe o pega un emoji',
    // Se ve dentro de la tarjeta de vista previa mientras el campo de nombre
    // está vacío, para que la tarjeta no aparezca a medias.
    productPreviewPlaceholder: 'Nombre del cultivo',
    productCatalogLabel: 'Agregar del catálogo',
    productCatalogHelp:
      'Estos los trae la app. Si el tuyo no está, créalo con el botón +.',
    productsCatalogLabel: 'Tu catálogo',
    productLockedTitle: 'No se puede editar',
    // Las dos razones por las que el nombre y el emoji quedan fijos. Las dos
    // terminan igual: se puede desactivar, que es lo que alguien realmente
    // quiere cuando deja de cosechar algo.
    productLockedCatalog:
      'Este cultivo lo trae la app, así que su nombre y su ícono los define ella — y son los mismos para todas las farms. Si ya no lo cosechas, puedes desactivarlo con el ojo.',
    productLockedInUse:
      'Ya hay jornadas anotadas con este cultivo. Si le cambiaras el nombre o el ícono, esas jornadas pasarían a decir otra cosa. Si ya no lo cosechas, puedes desactivarlo con el ojo.',
    addSuggestionTitle: 'Agregar cultivo',
    addSuggestionConfirm: (icon: string, name: string) =>
      `¿Agregar ${icon} ${name} a tu catálogo?`,
    activeWorkdayEntries: 'En la jornada activa',
    unitEquivalence: (name: string, kgFactor: number) =>
      `1 ${name} = ${formatKg(kgFactor)} kg`,
    unitWeighed: 'Se pesa en cada vuelta',
    unitNameLabel: 'Nombre (ej. Tarro 10kg)',
    kgFactorLabel: 'Cuántos kilos trae lleno',
    unitModeLabel: '¿Cómo se anota?',
    unitModeCount: 'Contando envases',
    unitModeWeight: 'Pesando cada uno',
    // Cortas a propósito: van las dos juntas en el selector de modo, dentro
    // de un diálogo que ya compite con el teclado. Lo que tiene que quedar
    // claro es el contraste (todos pesan igual / cada uno pesa distinto) y
    // cómo se lee una vuelta en cada caso.
    unitModeCountHelp: 'Todos pesan lo mismo. Ej: "trajo 2 tarros de 20 kg".',
    unitModeWeightHelp:
      'Cada uno pesa distinto, lo tomas de la romana. Ej: "trajo 1 capacho con 22,1 kg".',
    firstNameLabel: 'Nombre',
    lastNameLabel: 'Apellido',
    nicknameLabel: 'Apodo (opcional)',
    emptyList: 'Todavía no hay nada acá.',
  },
  settings: {
    title: 'Ajustes',
    logout: 'Cerrar sesión',
    logoutConfirm: '¿Seguro que quieres cerrar sesión?',
    logoutBlockedTitle: 'No puedes cerrar sesión todavía',
    logoutBlockedMessage:
      'Hay jornadas o entregas en este dispositivo que todavía no se sincronizaron. Sincronízalas primero — si cierras sesión ahora, se perderían.',
    goToSync: 'Ir a Sincronizar',
    farmInfo: 'Información de la farm',
    recordersCanManageCatalog: 'Anotadores pueden ver el catálogo',
    recordersCanManageCatalogHelp:
      'Si está prendido, cualquier anotador puede ver y agregar frutas, unidades de medida y cosechadores. Si lo apagas, solo los admin pueden.',
    theme: 'Tema',
    themeHelp: 'El color se guarda en este dispositivo, cada persona puede elegir el suyo.',
    palettes: {
      verde: 'Verde',
      morado: 'Morado',
      azul: 'Azul',
      naranja: 'Naranja',
    },
  },
  profile: {
    title: 'Perfil',
    nationalIdLabel: 'RUT',
    saved: 'Guardado',
  },
  switchRole: {
    title: 'Cambiar modo',
    subtitle:
      'Elige con qué rol quieres usar la app ahora. Puedes cambiar cuando quieras, sin cerrar sesión.',
  },
  errors: {
    generic: 'Algo salió mal. Intenta de nuevo.',
    network: 'No hay conexión. Revisa tu internet e intenta de nuevo.',
    invalidEmail: 'El correo electrónico no es válido.',
    emailInUse: 'Ya existe una cuenta con ese correo. Intenta iniciar sesión.',
    weakPassword: 'La contraseña debe tener al menos 6 caracteres.',
    invalidCredential: 'Correo o contraseña incorrectos.',
    tooManyRequests: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
    invalidInvitationCode: 'El código de invitación no es válido o ya no está activo.',
    alreadyOnboarded: 'Esta cuenta ya completó el registro.',
    // El índice único del server es {farmId, name} y NO mira `active`, así
    // que un cultivo desactivado sigue ocupando su nombre. Sin esa pista el
    // error es un callejón sin salida: no la ves en el catálogo y no
    // entiendes por qué no te deja crearla.
    duplicateProductName:
      'Ya tienes un cultivo con ese nombre. Búscalo en tu catálogo — puede estar desactivado.',
    duplicateUnitName:
      'Ya tienes una unidad de medida con ese nombre. Búscala en tu catálogo — puede estar desactivada.',
  },
} as const;
