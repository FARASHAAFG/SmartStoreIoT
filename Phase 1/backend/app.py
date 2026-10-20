
from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import re
import threading
import hardware as h

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_PATH = os.path.join(BASE_DIR, "database", "smartstore.db")

# Prevent two hardware signals from running at the same time
hardware_lock = threading.Lock()


def signal_hardware(success):
    def run_signal():
        with hardware_lock:
            try:
                if success:
                    h.trigger_success()
                else:
                    h.trigger_failure()
            except Exception as error:
                print("Hardware error:", error)

    # Run the LED/buzzer signal without delaying Flask's response
    threading.Thread(target=run_signal, daemon=True).start()


@app.route("/customers", methods=["POST"])
def add_customer():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        signal_hardware(False)
        return jsonify({
            "success": False,
            "message": "Invalid JSON request."
        }), 400

    name = data.get("name")
    address = data.get("address")
    telephone = data.get("telephone")
    email = data.get("email")

    # Validate required fields and data types
    if not all(
        isinstance(value, str) and value.strip()
        for value in (name, address, telephone, email)
    ):
        signal_hardware(False)
        return jsonify({
            "success": False,
            "message": "All fields are required."
        }), 400

    name = name.strip()
    address = address.strip()
    telephone = telephone.strip()
    email = email.strip()

    # Validate telephone number
    phone_pattern = r"[0-9\s()+-]{7,20}"

    if not re.fullmatch(phone_pattern, telephone):
        signal_hardware(False)
        return jsonify({
            "success": False,
            "message": "Please enter a valid telephone number."
        }), 400

    # Validate email address
    email_pattern = r"[^@\s]+@[^@\s]+\.[^@\s]+"

    if not re.fullmatch(email_pattern, email):
        signal_hardware(False)
        return jsonify({
            "success": False,
            "message": "Please enter a valid email address."
        }), 400

    # Insert customer into SQLite
    try:
        with sqlite3.connect(DATABASE_PATH) as connection:
            connection.execute("""
                INSERT INTO customers (name, address, telephone, email)
                VALUES (?, ?, ?, ?)
            """, (name, address, telephone, email))

        signal_hardware(True)

        return jsonify({
            "success": True,
            "message": "Customer added successfully!"
        }), 201

    except sqlite3.IntegrityError:
        signal_hardware(False)
        return jsonify({
            "success": False,
            "message": "A customer with this email already exists."
        }), 400

    except sqlite3.Error as error:
        print("Database error:", error)
        signal_hardware(False)
        return jsonify({
            "success": False,
            "message": "An unexpected database error occurred."
        }), 500


if __name__ == "__main__":
    app.run(debug=False, use_reloader=False)
