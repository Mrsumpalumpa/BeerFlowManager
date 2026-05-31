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

---

## 🎨 2. Pruebas Unitarias del Frontend

Las pruebas unitarias del frontend comprueban la interactividad de los componentes de React de manera aislada.

### Estructura y Ubicación
* **Ubicación:** `frontend/src/components/*.test.tsx`
* **Framework:** **Vitest** + **React Testing Library** + **JSDOM**

### Mocks y Resoluciones Clave
* **Mocks Reactivos para Framer Motion:** Las animaciones complejas (el llenado del vaso de cerveza y el contador de precios animado) utilizan `useSpring` y `useTransform` de Framer Motion, los cuales se procesan asíncronamente. Para los tests unitarios en JSDOM, se implementó un mock reactivo basado en los hooks `useState` y `useEffect` de React. Esto fuerza una propagación inmediata y un re-renderizado síncrono al llamar a `.set()`, permitiendo a los tests validar el valor final en el DOM sin esperas.
* **Aislamiento de Selectores:** Para evitar colisiones en componentes complejos con múltiples contenedores animados (como el líquido de cerveza y la espuma en `BeerGlass`), las pruebas identifican selectores por clases CSS únicas (`.bg-gradient-to-t`) en lugar de ids genéricos, proporcionando pruebas más estables.

---

## 🌐 3. Pruebas End-to-End (E2E) con Playwright

Las pruebas E2E validan la interacción real del usuario contra los navegadores web.

### Estructura y Ubicación
* **Ubicación:** `e2e/flow.spec.ts`
* **Framework:** **Playwright** + **TypeScript**

### Flujos Cubiertos
1. **Carga y Visualización:** Carga la interfaz del festival y comprueba que se listan los grifos activos con sus respectivos estilos de cerveza y precios correctos.
2. **Flujo de Consumo y Cierre por Inactividad:** Abre un grifo virtual simulando pulsos del sensor, verifica que el líquido y el precio incrementen dinámicamente en tiempo real en la pantalla y, tras el timeout de inactividad, confirma que la sesión se cierra automáticamente persistiendo el consumo.

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
