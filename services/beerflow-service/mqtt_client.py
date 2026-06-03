import asyncio
import json
import os
import aiomqtt
import logging

from controllers.sensor_controller import (
    process_pulse,
    process_unlock,
    SensorValidationError,
    SensorAuthError
)

logger = logging.getLogger("beerflow.mqtt")

async def mqtt_listener(redis_client):
    broker = os.getenv("MQTT_BROKER_HOST", "mosquitto")
    port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    
    print(f"[MQTT] Intentando conectar al broker {broker}:{port}...")
    
    # Intentar reconexión indefinidamente
    while True:
        try:
            async with aiomqtt.Client(hostname=broker, port=port) as client:
                print(f"[MQTT] ✅ Conectado al broker {broker}. Suscribiéndose a tópicos...")
                
                # Suscribirse a los tópicos de comandos y pulsos de todos los grifos
                await client.subscribe("beerflow/taps/+/+")
                
                async for message in client.messages:
                    topic = str(message.topic)
                    
                    try:
                        payload = json.loads(message.payload.decode())
                    except json.JSONDecodeError:
                        print(f"[MQTT] ⚠️ Payload inválido en tópico {topic}")
                        continue
                        
                    parts = topic.split("/")
                    if len(parts) < 4:
                        continue
                        
                    tap_id = parts[2]
                    action = parts[3]
                    
                    try:
                        if action == "pulse":
                            await process_pulse(
                                tap_id=tap_id,
                                pulses=payload.get("pulses", 0),
                                timestamp=payload.get("timestamp"),
                                redis=redis_client
                            )
                        elif action == "unlock":
                            await process_unlock(
                                tap_id=tap_id,
                                customer_id=payload.get("customer_id"),
                                redis=redis_client
                            )
                    except SensorValidationError as e:
                        print(f"[MQTT] ⚠️ Validación fallida para {tap_id}: {e}")
                    except SensorAuthError as e:
                        print(f"[MQTT] ⚠️ Autenticación fallida para {tap_id}: {e}")
                    except Exception as e:
                        print(f"[MQTT] ❌ Error procesando mensaje de {tap_id}: {e}")
                        
        except aiomqtt.MqttError as error:
            print(f"[MQTT] ❌ Error de conexión MQTT: {error}. Reconectando en 5s...")
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            print("[MQTT] 🛑 Cliente MQTT detenido.")
            break
        except Exception as e:
            print(f"[MQTT] ❌ Error inesperado: {e}. Reconectando en 5s...")
            await asyncio.sleep(5)
