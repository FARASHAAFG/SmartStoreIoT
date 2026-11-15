"""
Membership card reader (step 3).
The ESP32 + RC522 publishes the card UID on the MQTT topic "Membership",
same idea as the fridge sensors in Phase 2.
The cart page asks for the last scanned card and fills in the UID automatically.
"""

import paho.mqtt.client as mqtt

MQTT_HOST = "localhost"   # Mosquitto runs on this Pi
MQTT_PORT = 1883
MQTT_TOPIC = "Membership"

# scan_id goes up by 1 on every scan, so the page knows when a new card was tapped
last_card = {"uid": None, "scan_id": 0}


def on_connect(client, userdata, flags, reason_code, properties=None):
    print("Connected to MQTT broker")
    client.subscribe(MQTT_TOPIC)


def on_message(client, userdata, msg):
    uid = msg.payload.decode().strip()

    last_card["uid"] = uid
    last_card["scan_id"] += 1

    print("Membership card scanned:", uid)


def start():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect_async(MQTT_HOST, MQTT_PORT)
    client.loop_start()


def get_last_card():
    return dict(last_card)
