
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// Wi-Fi settings
const char* ssid = "iotvanier"; 
const char* password = "14730078"; 

// Raspberry Pi MQTT broker
const char* mqtt_server = "10.0.0.72"; //hostname -I at school and replace this
const int mqtt_port = 1883;

// ESP32 #1 uses Frig1
// ESP32 #2 will use Frig2
const char* mqtt_topic = "Frig2";
const char* client_id = "SmartStore_ESP32_2";

// DHT11 sensor
#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

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
  dht.begin();

  connectWiFi();
  mqtt.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqtt.connected()) {
    connectMQTT();
  }

  mqtt.loop();

  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  if (!isnan(temperature) && !isnan(humidity)) {
    String payload = "{\"temperature\":";
    payload += String(temperature, 1);
    payload += ",\"humidity\":";
    payload += String(humidity, 1);
    payload += "}";

    if (mqtt.publish(mqtt_topic, payload.c_str())) {
      Serial.print("Published to ");
      Serial.print(mqtt_topic);
      Serial.print(": ");
      Serial.println(payload);
    } else {
      Serial.println("MQTT publish failed");
    }
  } else {
    Serial.println("DHT11 reading failed");
  }

  delay(5000);
}
