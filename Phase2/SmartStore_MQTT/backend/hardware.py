import RPi.GPIO as GPIO
from time import sleep

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

Motor1 = 22 # Enable Pin
Motor2 = 27 # Input Pin
Motor3 = 17 # Input Pin

GPIO.setup(Motor1,GPIO.OUT)
GPIO.setup(Motor2,GPIO.OUT)
GPIO.setup(Motor3,GPIO.OUT)

fan_is_on = False

def fan_on():
		global fan_is_on
		GPIO.output(Motor1, GPIO.HIGH)
		GPIO.output(Motor2, GPIO.LOW)
		GPIO.output(Motor3, GPIO.HIGH)
		
		fan_is_on = True
		print("Fan is ON")
		
def fan_off():
		global fan_is_on
		
		GPIO.output(Motor1, GPIO.LOW)
		
		fan_is_on = False
		print("Fan is OFF")
		
		
fan_off()

