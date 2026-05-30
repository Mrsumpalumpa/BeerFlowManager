# 🍺 BeerFlow — Sistema de Autoservicio de Cerveza

Sistema IoT donde el cliente se sirve cerveza directamente y paga exactamente lo consumido, calculado en tiempo real por caudalímetro.

## Arquitectura

```
ESP32 / Simulador
      │ HTTP POST /sensor/pulse (o MQTT)
      ▼
beerflow-service :8000    ←── WebSocket ──► Frontend React :3000
      │  Redis (estado tiempo real)
      │
      ├─► billing-service :8001       (PostgreSQL)
      └─► tap-management-service :8002 (PostgreSQL)
```

## Inicio rápido

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Levantar infraestructura + servicios
docker compose up -d

# 3. (opcional) Ejecutar el simulador de sensor
docker compose --profile simulator up sensor-simulator
```

## Simulador de Caudalímetro (Sensor)

El simulador (`hardware/simulator/sensor_simulator.py`) emite pulsos simulando el consumo de cerveza de un grifo específico.

### Ejecución con Docker Compose
Por defecto, el contenedor simula el grifo `tap-001`. Para cambiar de grifo, puedes pasar la variable de entorno `TAP_ID` o ejecutar el comando explícito:

* **Simular grifo por defecto (`tap-001`)**:
  ```bash
  docker compose --profile simulator up sensor-simulator
  ```
* **Simular un grifo específico (ej. `tap-002`)**:
  ```bash
  sudo docker compose run --rm -e TAP_ID=tap-004 sensor-simulator
  
  ```

### Ejecución Local con Python
Si prefieres ejecutar el simulador localmente sin docker:
1. Instala `httpx` si no lo tienes: `pip install httpx`
2. Ejecuta indicando el ID del grifo y opcionalmente la duración:
   ```bash
   python3 hardware/simulator/sensor_simulator.py --tap-id tap-002 --duration 30
   ```

## Servicios

| Servicio               | Puerto | Descripción                              |
|------------------------|--------|------------------------------------------|
| beerflow-service       | 8000   | IoT + WebSocket tiempo real              |
| billing-service        | 8001   | Clientes, órdenes y cobros               |
| tap-management-service | 8002   | Grifos, barriles y precios               |
| Frontend React         | 3000   | UI del cliente                           |
| PostgreSQL             | 5432   | Base de datos transaccional              |
| Redis                  | 6379   | Estado en tiempo real de grifos          |
| Mosquitto MQTT         | 1883   | Broker para comunicación IoT             |

## Fases del proyecto

- **Fase 1** ✅ PoC Hardware (simulador Python)
- **Fase 2** ✅ beerflow-service + WebSocket + Redis
- **Fase 3** 🔄 Frontend React con animación del vaso
- **Fase 4** ⏳ Billing completo + Auth RFID/QR
- **Fase 5** ⏳ Pruebas de estrés + producción

## Física del caudalímetro

- Sensor: YF-S201 (grado alimentario)
- Calibración: **450 pulsos/litro** → 1 pulso ≈ 2.25 ml
- Intervalo de envío: 200ms
- Timeout de sesión: 3 segundos sin flujo → cierre automático

## Estructura

```
beerflow/
├── docker-compose.yml
├── .env.example
├── services/
│   ├── beerflow-service/
│   ├── billing-service/
│   └── tap-management-service/
├── frontend/
├── hardware/
│   └── simulator/
└── infra/
    ├── mosquitto/
    └── postgres/
```
