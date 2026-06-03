# 🧪 Guía de Pruebas — BeerFlow Manager

Este documento detalla la estrategia de pruebas, la configuración del entorno y las instrucciones para ejecutar las suites de pruebas (unitarias y de integración de extremo a extremo) del sistema BeerFlow Manager.

---

## 📋 Resumen de la Estrategia de Pruebas

El sistema cuenta con tres niveles de pruebas para asegurar la estabilidad e integridad de las funcionalidades de autoservicio, facturación y control de inventario:

1. **Pruebas Unitarias del Backend (Pytest):** Validan el comportamiento de las APIs REST de cada microservicio, el middleware de autenticación, y los flujos de comunicación con bases de datos simuladas.
2. **Pruebas Unitarias del Frontend (Vitest + React Testing Library):** Comprueban la renderización de los componentes críticos de la interfaz de usuario, interactividad, y estados de carga de la cerveza y del precio.
3. **Pruebas End-to-End / E2E (Playwright):** Simulan flujos de usuario reales de principio a fin, interactuando con los navegadores contra el entorno completo ejecutándose en Docker Compose.

---

## 🚀 Script Unificado de Pruebas (`run_tests.sh`)

Para simplificar la ejecución de las pruebas, se dispone del script `run_tests.sh` en la raíz del proyecto. Este script comprueba que los servicios requeridos de Docker Compose estén activos e inicia las pruebas automáticamente.

### Comandos de Ejecución

* **Ejecutar todas las pruebas (Backend, Frontend y E2E):**
  ```bash
  sudo ./run_tests.sh all
  ```
* **Ejecutar solo pruebas unitarias del Backend:**
  ```bash
  sudo ./run_tests.sh backend
  ```
* **Ejecutar solo pruebas unitarias del Frontend:**
  ```bash
  sudo ./run_tests.sh frontend
  ```
* **Ejecutar solo pruebas integrales E2E:**
  ```bash
  sudo ./run_tests.sh e2e
  ```

---

## ⚙️ 1. Pruebas Unitarias del Backend

Las pruebas de backend están escritas en **Python** utilizando el framework **Pytest** y se ejecutan dentro del entorno contenedorizado de cada microservicio.

### Estructura y Ubicación
Cada microservicio contiene su propia suite de pruebas bajo su respectivo directorio `tests/`:
* `services/beerflow-service/tests/`: Valida el sensor de flujo, actualización de estados de grifo en Redis, y alertas Pub/Sub.
* `services/billing-service/tests/`: Comprueba el flujo de autenticación de usuarios (registro, login, roles JWT) y finalización/cobro de pedidos.
* `services/tap-management-service/tests/`: Valida la configuración de grifos, inventario de barriles y reemplazo de stock.

### Decisiones de Diseño y Mocks
* **Base de Datos SQLite en memoria (Shared Cache):** Para aislar las pruebas transaccionales sin requerir una base de datos PostgreSQL real, se configura SQLite en modo `:memory:` con caché compartida (`cache=shared`). Esto garantiza que la conexión permanezca abierta y las tablas del esquema persistan de manera aislada durante toda la ejecución de cada hilo de prueba.
* **Mocks de Conectividad HTTPX:** Dado que las APIs se comunican asíncronamente entre sí, las llamadas entre microservicios se simulan interceptando el cliente `httpx.AsyncClient` con `AsyncMock` para las llamadas de red y `MagicMock` para simular las respuestas síncronas de la API (como `.json()`), evitando bloqueos y falsos negativos de red.

### Catálogo de Tests Unitarios del Backend

#### `beerflow-service` — `tests/test_sensor.py` (7 tests)

| # | Test | Descripción |
|---|------|-------------|
| 1 | `test_health` | Verifica que el endpoint `/health` responde `200 OK` con `{"status": "ok", "service": "beerflow-service"}`. |
| 2 | `test_receive_pulse_success` | Envía 10 pulsos (22.5 ml a 2.25 ml/pulso), verifica la respuesta con `ok=True`, `ml_total=22.5`, `price` correcto, y que Redis almacena el ID del barril y el volumen restante actualizado (`9977.5 ml`). |
| 3 | `test_receive_pulse_no_keg_error` | Simula que el grifo no tiene barril asignado (`keg_id="no-keg"`, `remaining_ml=0`). Verifica que devuelve `400` con el mensaje "no tiene ningún barril". |
| 4 | `test_receive_pulse_low_stock_block` | Simula stock bajo (4% restante, inferior al umbral del 5%). Verifica que la petición se bloquea con `400` y el mensaje "bloqueado". |
| 5 | `test_receive_pulse_publishes_alert` | Simula stock en el límite (2510 ml de 25000 ml). Tras consumir 22.5 ml, el stock baja a 2487.5 ml (≤10%). Verifica que se publica una alerta `LOW_STOCK` al canal Redis `admin:alerts` con los datos del grifo y volumen actual. |
| 6 | `test_receive_pulse_locked` | Intenta enviar pulsos a un grifo bloqueado (sin sesión en Redis) y verifica que devuelve `403`. |
| 7 | `test_unlock_tap` | Desbloquea un grifo y verifica que se inicializa correctamente la sesión `open` en Redis para el cliente dado. |

> **Nota IoT:** La lógica central de estos tests ahora valida el controlador `sensor_controller.py`, lo que garantiza que la funcionalidad es correcta tanto para peticiones HTTP como para los mensajes provenientes del broker **MQTT**.

#### `billing-service` — `tests/test_auth.py` (5 tests)

| # | Test | Descripción |
|---|------|-------------|
| 1 | `test_health` | Verifica que `/health` responde `200 OK` con `{"status": "ok", "service": "billing-service"}`. |
| 2 | `test_register_and_login_success` | Registra un usuario `testuser` con rol `CUSTOMER`, verifica la respuesta con `username`, `role` e `id`. Luego hace login con las credenciales creadas y verifica que devuelve `access_token`, `token_type=bearer` y `role=CUSTOMER`. |
| 3 | `test_register_duplicate_username` | Registra un usuario `dupuser` y al intentar registrar el mismo nombre de usuario, verifica que devuelve `400` con "already registered". |
| 4 | `test_login_invalid_credentials` | Intenta hacer login con un usuario inexistente y verifica que devuelve `401` con "Incorrect username or password". |
| 5 | `test_close_order` | Envía una petición de cierre de pedido con `tap_id`, `customer_id`, `ml_served` y `total_amount`. Verifica respuesta `200` con `{"ok": true, "order_id": null}`. |

#### `tap-management-service` — `tests/test_taps.py` (7 tests)

| # | Test | Descripción |
|---|------|-------------|
| 1 | `test_health` | Verifica que `/health` responde `200 OK` con `{"status": "ok", "service": "tap-management-service"}`. |
| 2 | `test_get_all_taps` | Obtiene la lista de grifos (`/taps`) y verifica que haya al menos 2. Valida que `tap-001` tiene nombre "Grifo 1", precio `0.0065 €/ml`, no está bloqueado, y tiene 100% de stock restante. |
| 3 | `test_get_tap_price` | Consulta el precio de `tap-001` y verifica `0.0065 €/ml`. Consulta un grifo inexistente y verifica que devuelve el precio fallback de `0.005 €/ml`. |
| 4 | `test_get_active_keg_success` | Obtiene el barril activo de `tap-001` y verifica que tiene `keg_id`, `capacity_ml=25000`, `remaining_ml=25000` y `price_per_ml=0.0065`. |
| 5 | `test_get_active_keg_not_found` | Consulta el barril activo de un grifo inexistente y verifica `404` con "Tap not found". |
| 6 | `test_consume_keg_success` | Obtiene el barril activo de `tap-001`, consume 1500 ml, y verifica que el restante baja a 23500 ml. Comprueba que la lista de grifos refleja el porcentaje actualizado `(23500/25000)*100`. |
| 7 | `test_consume_keg_not_found` | Intenta consumir de un barril con UUID aleatorio y verifica `404` con "Keg not found". |

---

## 🎨 2. Pruebas Unitarias del Frontend

Las pruebas unitarias del frontend comprueban la interactividad de los componentes de React de manera aislada.

### Estructura y Ubicación
* **Ubicación:** `frontend/src/components/*.test.tsx`
* **Framework:** **Vitest** + **React Testing Library** + **JSDOM**

### Mocks y Resoluciones Clave
* **Mocks Reactivos para Framer Motion:** Las animaciones complejas (el llenado del vaso de cerveza y el contador de precios animado) utilizan `useSpring` y `useTransform` de Framer Motion, los cuales se procesan asíncronamente. Para los tests unitarios en JSDOM, se implementó un mock reactivo basado en los hooks `useState` y `useEffect` de React. Esto fuerza una propagación inmediata y un re-renderizado síncrono al llamar a `.set()`, permitiendo a los tests validar el valor final en el DOM sin esperas.
* **Aislamiento de Selectores:** Para evitar colisiones en componentes complejos con múltiples contenedores animados (como el líquido de cerveza y la espuma en `BeerGlass`), las pruebas identifican selectores por clases CSS únicas (`.bg-gradient-to-t`) en lugar de ids genéricos, proporcionando pruebas más estables.

### Catálogo de Tests Unitarios del Frontend

#### `BeerGlass.test.tsx` — Componente BeerGlass (3 tests)

| # | Test | Descripción |
|---|------|-------------|
| 1 | `se renderiza correctamente con 0ml (vacío)` | Renderiza `<BeerGlass mlTotal={0} maxCapacity={500} />`, verifica que el SVG del vaso está en el DOM y que el div del líquido tiene `height: 0%`. |
| 2 | `se renderiza correctamente al 50% de su capacidad` | Renderiza con `mlTotal=250` y `maxCapacity=500`, verifica que el líquido tiene `height: 50%`. |
| 3 | `limita el llenado al 100% si el volumen supera la capacidad máxima` | Renderiza con `mlTotal=600` y `maxCapacity=500` (sobrepasado), verifica que se limita a `height: 100%`. |

#### `PriceCounter.test.tsx` — Componente PriceCounter (3 tests)

| # | Test | Descripción |
|---|------|-------------|
| 1 | `se renderiza correctamente con el precio inicial en cero` | Renderiza `<PriceCounter value={0} />` y verifica que muestra `€0.00`. |
| 2 | `formatea correctamente valores decimales a euros` | Renderiza con `value=5.5` y verifica que muestra `€5.50`. |
| 3 | `redondea correctamente a 2 decimales` | Renderiza con `value=3.14159` y verifica que muestra `€3.14`. |

---

## 🌐 3. Pruebas End-to-End (E2E) con Playwright

Las pruebas E2E validan la interacción real del usuario contra los navegadores web.

### Estructura y Ubicación
* **Ubicación:** `e2e/flow.spec.ts`
* **Framework:** **Playwright** + **TypeScript**
* **Base URL:** `http://localhost:8080` (a través de Nginx reverse proxy)

### Catálogo de Tests E2E

#### `flow.spec.ts` — BeerFlow Manager E2E (2 tests)

| # | Test | Descripción |
|---|------|-------------|
| 1 | `debe cargar la página principal y mostrar el grifo activo` | Navega a `/`, verifica que el título `BeerFlow` se muestra, que el selector de grifo tiene `tap-001` por defecto, y que el indicador de estado de conexión está visible. |
| 2 | `debe fluir la cerveza en tiempo real y cerrar la sesión por inactividad` | Navega a `/`, espera la conexión WebSocket. Envía 20 pulsos (45 ml) al endpoint `http://localhost:8080/api/beerflow/sensor/pulse`. Verifica que el frontend muestra `45` ml y la etiqueta `VERTIDO ACTIVO`. Espera 6.5s de inactividad y verifica que aparece el mensaje `¡Sesión Finalizada! Cobrando...`. |

### Requisitos Previos e Instalación Local
Para ejecutar los tests E2E directamente en local sin usar el script general:
1. Navega al directorio E2E e instala las dependencias:
   ```bash
   cd e2e
   pnpm install
   ```
2. Instala los binarios del navegador de Playwright:
   ```bash
   pnpm exec playwright install
   ```
3. Ejecuta las pruebas:
   ```bash
   pnpm test
   ```

---

## 📊 Resumen Total

| Suite | Framework | Tests | Ubicación |
|-------|-----------|-------|-----------|
| beerflow-service | Pytest | 5 | `services/beerflow-service/tests/test_sensor.py` |
| billing-service | Pytest | 5 | `services/billing-service/tests/test_auth.py` |
| tap-management-service | Pytest | 7 | `services/tap-management-service/tests/test_taps.py` |
| Frontend — BeerGlass | Vitest | 3 | `frontend/src/components/BeerGlass.test.tsx` |
| Frontend — PriceCounter | Vitest | 3 | `frontend/src/components/PriceCounter.test.tsx` |
| E2E | Playwright | 2 | `e2e/flow.spec.ts` |
| **Total** | | **25** | |
