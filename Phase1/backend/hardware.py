import RPi.GPIO as GPIO
from time import sleep

# Define physical BOARD pin numbers
BLUE_LED = 13  # IO27
RED_LED = 16   # IO23
BUZZER = 40    # IO21

GPIO.setwarnings(False)
GPIO.setmode(GPIO.BOARD)

# Setup pins as outputs
GPIO.setup(BLUE_LED, GPIO.OUT, initial=GPIO.LOW)
GPIO.setup(RED_LED, GPIO.OUT, initial=GPIO.LOW)
GPIO.setup(BUZZER, GPIO.OUT, initial=GPIO.LOW)


def all_off():
    """Turn off both LEDs and the buzzer."""
    GPIO.output(BLUE_LED, GPIO.LOW)
    GPIO.output(RED_LED, GPIO.LOW)
    GPIO.output(BUZZER, GPIO.LOW)


def trigger_success():
    """Blue LED turns on for 1 second."""
    all_off()

    GPIO.output(BLUE_LED, GPIO.HIGH)
    print("Operation Success! Blue LED is ON.")

    sleep(1)
    all_off()


def trigger_failure():
    """Red LED and buzzer activate for 1 second."""
    all_off()

    GPIO.output(RED_LED, GPIO.HIGH)

    # Generate a 1000 Hz tone with 50% duty cycle
    buzzer_pwm = GPIO.PWM(BUZZER, 1000)

    try:
        buzzer_pwm.start(50)
        print("Operation Failed! Red LED and Buzzer are ON.")

        sleep(1)
    finally:
        buzzer_pwm.stop()
        all_off()