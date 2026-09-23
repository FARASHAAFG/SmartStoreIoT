import RPi.GPIO as GPIO
from time import sleep

# Define physical BOARD pin numbers
BLUE_LED = 13  # IO 27
RED_LED = 16   # IO 23
BUZZER = 40    # IO 21

GPIO.setwarnings(False)     # Disable warnings
GPIO.setmode(GPIO.BOARD)    # Set pin numbering system

# Setup pins as outputs
GPIO.setup(BLUE_LED, GPIO.OUT)
GPIO.setup(RED_LED, GPIO.OUT)
GPIO.setup(BUZZER, GPIO.OUT)

def all_off():
    """Turns off all indicators."""
    GPIO.output(BLUE_LED, GPIO.LOW)
    GPIO.output(RED_LED, GPIO.LOW)
    GPIO.output(BUZZER, GPIO.LOW)

def trigger_success():
    """Turns on the blue LED for success."""
    all_off()
    GPIO.output(BLUE_LED, GPIO.HIGH)
    print("Operation Success! Blue LED is ON.")

def trigger_failure():
    """Turns on the red LED and activates the buzzer for an error."""
    all_off()
    GPIO.output(RED_LED, GPIO.HIGH)
    GPIO.output(BUZZER, GPIO.HIGH)
    print("Operation Failed! Red LED and Buzzer are ON.")

