from flask import Flask, request, jsonify # type: ignore
from flask_cors import CORS # type: ignore
import sqlite3
import os

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_PATH = os.path.join(BASE_DIR, "database", "smartstore.db")


@app.route("/customers", methods=["POST"])
def add_customer():

    data = request.get_json()

    name = data.get("name")
    address = data.get("address")
    telephone = data.get("telephone")
    email = data.get("email")

    # Make sure all information was provided
    if not name or not address or not telephone or not email:
        return jsonify({
            "success": False,
            "message": "All fields are required."
        }), 400

    try:
        connection = sqlite3.connect(DATABASE_PATH)
        cursor = connection.cursor()

        cursor.execute("""
            INSERT INTO customers (name, address, telephone, email)
            VALUES (?, ?, ?, ?)
        """, (name, address, telephone, email))

        connection.commit()
        connection.close()

        return jsonify({
            "success": True,
            "message": "Customer added successfully!"
        }), 201

    except sqlite3.IntegrityError:

        return jsonify({
            "success": False,
            "message": "A customer with this email already exists."
        }), 400

    except Exception as error:

        print(error)

        return jsonify({
            "success": False,
            "message": "An unexpected error occurred."
        }), 500


if __name__ == "__main__":
    app.run(debug=True)