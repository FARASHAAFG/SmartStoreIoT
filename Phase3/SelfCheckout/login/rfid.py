import serial

ser = serial.Serial(
    "/dev/ttyUSB0",
    baudrate=9600,
    timeout=1
)

print("Waiting for RFID tags...")

while True:
    data = ser.readline()

    if data:
        print("Raw data:", data.hex(" "))
