// Copy de la app, agrupado por pantalla/dominio. Ninguna pantalla debería
// tener un string en español hardcodeado — todo se lee de acá, así se puede
// ajustar la terminología de campo ("Anotar", "Tarro", "Vuelta" — RNF-02) en
// un solo lugar sin tener que buscarla pantalla por pantalla.
//
// No es una librería de i18n completa (react-i18next, etc.) a propósito: la
// app tiene un solo idioma de destino, así que un objeto de constantes es
// suficiente y no agrega una dependencia ni una capa de indirección de más.

export const strings = {
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    continue: 'Continuar',
    delete: 'Eliminar',
    edit: 'Editar',
    add: 'Agregar',
    loading: 'Cargando...',
    retry: 'Reintentar',
    error: 'Ocurrió un error',
  },
  auth: {
    loginTitle: 'Iniciar sesión',
    signupTitle: 'Crear cuenta',
    email: 'Correo electrónico',
    password: 'Contraseña',
    loginButton: 'Iniciar sesión',
    signupButton: 'Registrarme',
    noAccount: '¿No tienes cuenta? Regístrate',
    hasAccount: '¿Ya tienes cuenta? Inicia sesión',
  },
  onboarding: {
    roleQuestion: '¿Cómo vas a usar AnotaYa?',
    roleAdmin: 'Administro un equipo o trabajo de forma independiente',
    roleRecorder: 'Voy a anotar cosechas de un equipo existente',
    nameLabel: 'Tu nombre',
    farmNameLabel: 'Nombre de tu farm',
    farmTypeOrganization: 'Crear farm para mi equipo',
    farmTypeIndependent: 'Trabajar de forma independiente',
    createFarmButton: 'Crear farm',
    invitationCodeLabel: 'Código de invitación',
    invitationCodeShare: 'Comparte este código con tu equipo para que se unan',
    joinFarmTitle: 'Unirme a una farm',
    joinFarmButton: 'Unirme',
  },
  home: {
    title: 'Inicio',
    openWorkday: 'Abrir Jornada',
    activeWorkday: 'Jornada activa',
    history: 'Historial de jornadas',
    noActiveWorkday: 'No tienes una jornada abierta',
  },
  workday: {
    openTitle: 'Abrir Jornada',
    date: 'Fecha',
    fruit: 'Fruta',
    measurementUnit: 'Envase / Unidad de medida',
    open: 'Abrir',
    closeTitle: 'Cerrar Jornada',
    closeConfirm: 'Al cerrar, los totales del día quedan congelados y ya no se pueden agregar más entregas.',
    close: 'Cerrar Jornada',
    totalKg: 'Total del día',
  },
  anotador: {
    title: 'Anotador',
    tapToRecord: 'Anotar',
    addHarvester: 'Agregar cosechador',
    searchHarvester: 'Buscar cosechador',
    newHarvester: 'Registrar nuevo cosechador',
    total: 'Total',
    units: 'unidades',
    kg: 'kg',
  },
  sync: {
    title: 'Sincronizar',
    pendingCount: (count: number) =>
      count === 1 ? '1 anotación pendiente de subir' : `${count} anotaciones pendientes de subir`,
    synced: 'Todo sincronizado',
    syncButton: 'Sincronizar Jornada',
    syncing: 'Sincronizando...',
    rejectedItems: 'No se pudieron subir algunos registros',
  },
  admin: {
    fruitsTitle: 'Frutas',
    measurementUnitsTitle: 'Unidades de medida',
    harvestersTitle: 'Cosechadores',
    teamTitle: 'Mi equipo',
    newFruit: 'Nueva fruta',
    newMeasurementUnit: 'Nueva unidad',
    newHarvester: 'Nuevo cosechador',
    kgFactorLabel: 'Factor de conversión a kilos',
  },
  settings: {
    title: 'Ajustes',
    logout: 'Cerrar sesión',
    farmInfo: 'Información de la farm',
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
  },
} as const;
