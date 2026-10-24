from flask import Flask, request, jsonify
from flask_cors import CORS
from getpass import getpass
import paho.mqtt.client as mqtt
import sqlite3
import threading
import time
import json


import database 
import email_alert
import hardware as h

app = Flask(__name__)
CORS(app)

readings = {
	"Frig1": {"temperature": None, "humidity": None},
	"Frig2": {"temperature": None, "humidity": None},
}

alert_sent = {"Frig1": False, "Frig2": False}

waiting_for_reply = {}

last_alert = None

# MQTT
def on_connect(client, userdata, flags, reason_code, properties=None):
	print("Connected to MQTT broker")
	client.subscribe("Frig1")
	client.subscribe("Frig2")
	
def on_message(client, userdata, msg):
		global last_alert
		
		try:
			fridge = msg.topic
			data = json.loads(msg.payload.decode())
			
			readings[fridge] = data
			
			temperature = data["temperature"]
			threshold = database.get_threshold(fridge)
			
			if temperature > threshold and not alert_sent[fridge]:
				waiting_for_reply[fridge] = list(email_alert.get_replies(fridge))
				
				email_alert.send_alert(fridge, temperature)
				alert_sent[fridge] = True
				
				last_alert = {
					"fridge": fridge,
					"message": f"Email sent: {fridge} is at {temperature} C (threshold {threshold} C)",
					"time": time.strftime("%H:%M:%S:"),
				}
				
			elif temperature < threshold -1:
				alert_sent[fridge] = False
		except Exception as error:
			print("Error:", error)
			
# Email replies
def check_replies():
	while True:
		for fridge in list(waiting_for_reply):
			try:
				replies = email_alert.get_replies(fridge)
			except Exception as error:
				print("Error:", error)
				continue
			
			new_replies = [i for i in replies if i not in waiting_for_reply[fridge]]
			
			if new_replies:
				answer = replies[new_replies[-1]]
				del waiting_for_reply[fridge]
				
				if answer.upper().startswith("YES"):
					print(f"{fridge}: user replied YES")
					h.fan_on()
				else:
					print(f"{fridge}: user replied '{answer}', no action")
	time.sleep(10)


# Routes for the dashboard

@app.route("/status", methods=["GET"])
def get_status():
	return jsonify({
		"Frig1": readings["Frig1"],
		"Frig2": readings["Frig2"],
		"thresholds": {
			"Frig1": database.get_threshold("Frig1"),
			"Frig2": database.get_threshold("Frig2"),
		},
		"fan": "ON" if h.fan_is_on else "OFF",
		"alert": last_alert,
	})
 
 
@app.route("/thresholds/<fridge>", methods=["PUT"])
def update_threshold(fridge):
	data = request.get_json(silent=True) or {}
	threshold = data.get("threshold")
	 
	if fridge not in readings:
		return jsonify({"success": False, "message": "Unknown fridge."}), 404
	 
	if not isinstance(threshold, (int, float)):
		return jsonify({"success": False, "message": "Threshold must be a number."}), 400
	 
	database.set_threshold(fridge, threshold)
	return jsonify({"success": True, "message": f"{fridge} threshold set to {threshold} °C."})
 
 
@app.route("/fan", methods=["POST"])
def set_fan():
	data = request.get_json(silent=True) or {}
 
	if data.get("state") == "ON":
		h.fan_on()
	else:
		h.fan_off()
 
	return jsonify({"success": True, "fan": "ON" if h.fan_is_on else "OFF"})
 
 
if __name__ == "__main__":
	database.create_database()
	 
	 # Asked once when the program starts, like in the email labs
	email_alert.password = getpass("Gmail app password: ")
	 
	client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
	client.on_connect = on_connect
	client.on_message = on_message
	client.connect("localhost", 1883) # Mosquitto runs on this Pi
	client.loop_start()
	 
	threading.Thread(target=check_replies, daemon=True).start()
	 
	try:
		app.run(host="0.0.0.0", debug=False, use_reloader=False)
	finally:
		h.fan_off()
