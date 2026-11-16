// Membership card reader: RC522 RFID lab + Phase 2 MQTT publishing
// Publishes the card UID (e.g. "A5 C7 4D 06") on the MQTT topic "Membership"

#include <WiFi.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <MFRC522.h>

// Wi-Fi settings (the ESP32 only works on 2.4 GHz: turn on "Maximize Compatibility" on an iPhone hotspot)
const char* ssid = "Joy";
const char* password = "hi1234567";

// Raspberry Pi MQTT broker
const char* mqtt_server = "172.20.10.9"; // hostname -I on the Pi
const int mqtt_port = 1883;

const char* mqtt_topic = "Membership";
const char* client_id = "SmartStore_ESP32_Membership";

// RC522 pins (same as the RFID lab)
#define SS_PIN 5   // SDA
#define RST_PIN 4  // RST

MFRC522 rfid(SS_PIN, RST_PIN);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

String lastUid = "";
unsigned long lastScanTime = 0;

void connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("Connected! IP: ");
  Serial.println(WiFi.localIP());
}

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Connecting to MQTT...");

    if (mqtt.connect(client_id)) {
      Serial.println("Connected!");
    } else {
      Serial.print("Failed, state: ");
      Serial.println(mqtt.state());
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();

  connectWiFi();
  mqtt.setServer(mqtt_server, mqtt_port);

  Serial.println("Place your membership card near the reader...");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqtt.connected()) {
    connectMQTT();
  }

  mqtt.loop();

  // Same as the RFID lab
  if (!rfid.PICC_IsNewCardPresent()) {
    return;
  }

  if (!rfid.PICC_ReadCardSerial()) {
    return;
  }

  // Build the UID text, e.g. "A5 C7 4D 06"
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (i > 0) uid += " ";
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  // Don't send the same card again if it's still on the reader
  if (uid == lastUid && millis() - lastScanTime < 3000) {
    rfid.PICC_HaltA();
    return;
  }

  if (mqtt.publish(mqtt_topic, uid.c_str())) {
    Serial.print("Published to ");
    Serial.print(mqtt_topic);
    Serial.print(": ");
    Serial.println(uid);
  } else {
    Serial.println("MQTT publish failed");
  }

  lastUid = uid;
  lastScanTime = millis();

  rfid.PICC_HaltA();
}
