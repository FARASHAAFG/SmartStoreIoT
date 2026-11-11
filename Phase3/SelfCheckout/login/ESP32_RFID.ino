#include <SPI.h>
#include <MFRC522.h>
// Define pins for RFID
#define SS_PIN 5                // SDA Pin on RC522
#define RST_PIN 4               // RST Pin on RC522
MFRC522 rfid(SS_PIN, RST_PIN);  // Create MFRC522 instance
void setup() {
  Serial.begin(115200);  // Initialize serial communication
  SPI.begin();           // Initialize SPI bus
  rfid.PCD_Init();       // Initialize MFRC522 reader
  Serial.println("Place your RFID card near the reader...");
}
void loop() {
  // Look for new cards
  if (!rfid.PICC_IsNewCardPresent()) {
    return;
  }
  // Select one of the cards
  if (!rfid.PICC_ReadCardSerial()) {
    return;
  }
  // Print UID
  Serial.print("Card UID:");
  for (byte i = 0; i < rfid.uid.size; i++) {
    Serial.print(rfid.uid.uidByte[i] < 0x10 ? " 0" : " ");
    Serial.print(rfid.uid.uidByte[i], HEX);
  }
  Serial.println();
  // Halt PICC
  rfid.PICC_HaltA();
}