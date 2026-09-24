# Documento de Requerimientos del Sistema (SRS)
## Sistema Digital de Control de Cosecha (NovaFarm)

---

### 1. Visión General del Proyecto

El objetivo principal es digitalizar el proceso manual de control de cosecha realizado en campo (actualmente hecho con lápiz y cuaderno). La aplicación reemplazará la anotación física de "rayas" por una interfaz móvil ultrarrápida, garantizando flexibilidad total ante cambios futuros en el tipo de fruta, envases o formas de medición, y asegurando el trabajo continuo en zonas sin cobertura de red (*Offline-First*).

---

### 2. Principales Requerimientos Funcionales (RF)

#### RF-01: Gestión de Jornadas y Configuración de Trabajo
* **RF-01.1:** El sistema debe permitir abrir una nueva **Jornada de Cosecha** seleccionando:
  * Fecha del día.
  * Fruta a cosechar (Ej: Limón, Naranja, Palta).
  * Envase / Unidad de medida por defecto para el día (Ej: Tarro 10kg, Saco 20kg, Canasto 15kg).
* **RF-01.2:** El sistema debe permitir el cierre formal de la jornada para congelar los datos del día y generar los totales definitivos.

#### RF-02: Registro Rápido de Cosecha (El "Anotador")
* **RF-02.1:** La interfaz principal del anotador debe listar a los cosechadores activos del día de forma clara.
* **RF-02.2:** Cada cosechador en pantalla debe contar con un mecanismo de toque único (*1-tap*) para **anotar 1 unidad** (1 tarro/vuelta).
* **RF-02.3:** El sistema debe ofrecer botones de acceso rápido para sumar o restar volúmenes (ej: `+1`, `+2`, `+5`, `-1`) en caso de entregas múltiples o corrección de errores.
* **RF-02.4:** El sistema debe mostrar en tiempo real los totales individuales (tanto en número de tarros/envases como en kilos equivalentes) y el gran total general del día.

#### RF-03: Flexibilidad y Adaptabilidad Futura
* **RF-03.1:** **Cambio de Envases/Medidas:** El sistema debe permitir administrar una tabla de unidades de medida con su respectivo factor de conversión a kilos (ej: 1 Tarro = 10.0 kg; 1 Saco = 20.0 kg).
* **RF-03.2:** **Modo Pesaje Directo:** El sistema debe permitir cambiar la modalidad de registro de "Conteo de envases" a "Pesaje directo" (donde el valor ingresado es directamente el peso en kilos desde una balanza).
* **RF-03.3:** **Multi-Fruta:** El catálogo de productos/frutas debe ser completamente configurable sin necesidad de alterar la base de datos ni el código del sistema.

#### RF-04: Sincronización y Trabajo Offline (*Offline-First*)
* **RF-04.1:** Toda la captura de datos durante el día debe realizarse **100% en local** (usando SQLite / PWA / IndexedDB) sin requerir conexión a internet.
* **RF-04.2:** La aplicación debe incluir un indicador visual claro de estado de sincronización (Ej: *"15 anotaciones pendientes de subir"* / *"Sincronizado"*).
* **RF-04.3:** El usuario podrá **subir la información al servidor** al final del día, al tener señal en el campo o cuando lo estime conveniente mediante un botón explícito de *"Sincronizar Jornada"*.

---

### 3. Requerimientos No Funcionales (RNF)

* **RNF-01: Rendimiento y Velocidad:** El tiempo de respuesta al presionar el botón de "anotar" debe ser inferior a 100 ms. No debe existir latencia de red durante el registro diario.
* **RNF-02: Usabilidad de Campo (UX/UI):**
  * Botones táctiles grandes aptos para uso con una sola mano o bajo luz solar directa.
  * Tipografía e indicadores de alto contraste.
  * Terminología amigable y familiar adaptada al lenguaje de terreno (*"Anotar"*, *"Tarro"*, *"Vuelta"*).
* **RNF-03: Persistencia Local e Integridad:** Los datos guardados localmente no deben perderse aunque el teléfono se apague, se quede sin batería o se reinicie la aplicación.
* **RNF-04: Compatibilidad:** La app debe poder ejecutarse en dispositivos móviles gama media o baja (Android / iOS / PWA).

---

### 4. Modelo de Datos Relacional (Propuesta DDL SQL)

```sql
-- 1. Cosechadores / Trabajadores
CREATE TABLE cosechadores (
    id SERIAL PRIMARY KEY,
    rut_id VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);

-- 2. Frutas / Cultivos
CREATE TABLE frutas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    activa BOOLEAN DEFAULT TRUE
);

-- 3. Unidades de Medida / Envases
CREATE TABLE unidades_medida (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,        -- Ej: 'Tarro 10kg', 'Saco 20kg', 'Kilo Directo'
    factor_kilos DECIMAL(8, 3) NOT NULL, -- Ej: 10.000 para tarro, 1.000 para kg directo
    activa BOOLEAN DEFAULT TRUE
);

-- 4. Jornadas de Trabajo (Día de Cosecha)
CREATE TABLE jornadas (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    fruta_id INT NOT NULL REFERENCES frutas(id),
    unidad_medida_defecto_id INT NOT NULL REFERENCES unidades_medida(id),
    estado VARCHAR(20) DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'CERRADA')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Detalle de Cosecha (Tarjetón / Anotaciones)
CREATE TABLE cosechas_detalle (
    id SERIAL PRIMARY KEY,
    jornada_id INT NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
    cosechador_id INT NOT NULL REFERENCES cosechadores(id),
    unidad_medida_id INT NOT NULL REFERENCES unidades_medida(id),
    cantidad_unidades DECIMAL(8, 2) NOT NULL DEFAULT 1,
    kilos_totales DECIMAL(10, 3) NOT NULL,
    hora_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sincronizado_offline BOOLEAN DEFAULT FALSE
);

-- Índices recomendados
CREATE INDEX idx_jornadas_fecha ON jornadas(fecha);
CREATE INDEX idx_cosechas_jornada ON cosechas_detalle(jornada_id);

---

**Parte 3: Flujo de Usuario en Campo**

```markdown
---

### 5. Flujo de Trabajo del Usuario en Campo

1. **Inicio del día:** El anotador abre la app, selecciona la fruta (ej. Limón) y confirma el envase del día (ej. Tarro 10kg).
2. **Durante la jornada:**
   * El cosechador llega a la estación con su carga.
   * El anotador toca el nombre del cosechador o presiona **"+1 Tarro"**.
   * La app suma la unidad, calcula los kilos correspondientes y guarda el registro localmente al instante.
3. **Cierre de jornada:**
   * Al finalizar el turno, el anotador revisa los totales generales del día.
   * Presiona el botón **"Sincronizar Datos"** cuando dispone de conexión a internet o señal móvil.