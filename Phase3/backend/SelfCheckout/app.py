import sys
import json
import os
import sqlite3

from pathlib import Path
from threading import RLock
from decimal import Decimal, InvalidOperation

from flask import Flask, request, jsonify, send_from_directory, session

# Locate the parent backend directory
BACKEND_DIR = Path(__file__).resolve().parent.parent

# Allow imports from backend/
sys.path.insert(0, str(BACKEND_DIR))

from database import DATABASE_PATH
from customer_sales import init_customer_sales

# Membership card (ESP32 + RC522 over MQTT)
from database import create_database
import membership_mqtt

# File locations
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent.parent / "frontend"

EPC_FILE = BASE_DIR / "discovered_epcs.txt"
PRODUCT_FILE = BASE_DIR / "registered_products.json"


# Initialize Flask
app = Flask(__name__)

app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")

if not app.config["SECRET_KEY"]:
    raise RuntimeError(
        "SECRET_KEY environment variable is missing.\n"
        "To configure it in PowerShell:\n"
        '1. Generate a key: py -c "import secrets; print(secrets.token_hex(32))"\n'
        '2. Set it: $env:SECRET_KEY = "YOUR_GENERATED_KEY"\n'
        "3. Start Flask: py app.py"
        "\n"
        "To configure it in CMD:\n"
        "1. Generate a key: py -c \"import secrets; print(secrets.token_hex(32))\"\n"
        "2. Set it: set SECRET_KEY=THE-KEY-GENERATED-FROM-PREVIOUS-LINE\n"
        "3. Start Flask: py app.py"
        )

# Create the database tables if they don't exist yet
create_database()

init_customer_sales(
    app,
    database_path=DATABASE_PATH
)

def get_database_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection

lock = RLock()

# Current shopping session
scanned_tags = []
removed_tags = set()

# All EPCs observed by the reader
discovered_tags = set()

# EPC -> product mapping
products = {}


def normalize_epc(value):
    if not isinstance(value, str):
        return None

    epc = "".join(value.split()).upper()

    if not epc or len(epc) > 24:
        return None

    if not all(char in "0123456789ABCDEF" for char in epc):
        return None

    return epc


def save_products():
    temporary_file = PRODUCT_FILE.with_suffix(".tmp")

    temporary_file.write_text(
        json.dumps(products, indent=4),
        encoding="utf-8"
    )

    temporary_file.replace(PRODUCT_FILE)


# def load_data():
#     if EPC_FILE.exists():
#         for line in EPC_FILE.read_text(
#             encoding="utf-8"
#         ).splitlines():
#             epc = normalize_epc(line)
#             if epc:
#                 discovered_tags.add(epc)


#     if PRODUCT_FILE.exists():
#         saved = json.loads(
#             PRODUCT_FILE.read_text(encoding="utf-8")
#         )

#         for raw_epc, product in saved.items():
#             epc = normalize_epc(raw_epc)

#             if epc and isinstance(product, dict):
#                 products[epc] = product

def load_data():
    # Load EPCs previously discovered by the RFID reader.
    if EPC_FILE.exists():
        for line in EPC_FILE.read_text(
            encoding="utf-8"
        ).splitlines():

            epc = normalize_epc(line)

            if epc:
                discovered_tags.add(epc)

    # Load registered products from SQLite.
    load_products_from_database()


def save_epc(epc):
    if epc not in discovered_tags:
        discovered_tags.add(epc)

        with EPC_FILE.open("a", encoding="utf-8") as file:
            file.write(epc + "\n")


def get_cart_data():
    items = []
    total = 0

    for epc in scanned_tags:
        product = products.get(epc)

        if not product:
            continue

        price = float(product["price"])

        items.append({
            "product_id": product["product_id"],
            "epc": epc,
            "name": product["name"],
            "price": price,
            "quantity": 1
        })

        total += price

    return {
        "items": items,
        "total": round(total, 2),
        "item_count": len(items)
    }


def process_epc(raw_epc):
    epc = normalize_epc(raw_epc)

    if not epc:
        return {
            "epc": raw_epc,
            "status": "invalid"
        }

    save_epc(epc)

    product = products.get(epc)

    if not product:
        return {
            "epc": epc,
            "status": "unknown"
        }

    if product["stock"] <= 0:
        return {
            "epc": epc,
            "status": "out_of_stock"
        }

    if epc in removed_tags:
        return {
            "epc": epc,
            "status": "removed"
        }

    if epc in scanned_tags:
        return {
            "epc": epc,
            "status": "duplicate"
        }

    scanned_tags.append(epc)

    print("Product scanned:", product["name"])

    return {
        "epc": epc,
        "status": "added",
        "product": product
    }

# ========== FRONTEND ==========

@app.route("/")
def home_page():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/index.html")
def index_page():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/cart.html")
def cart_page():
    return send_from_directory(FRONTEND_DIR, "cart.html")

@app.route("/login.html")
def login_page():
    return send_from_directory(FRONTEND_DIR, "login.html")


@app.route("/register.html")
def register_page():
    return send_from_directory(FRONTEND_DIR, "register.html")


@app.route("/account.html")
def account_page():
    return send_from_directory(FRONTEND_DIR, "account.html")


@app.route("/account.js")
def account_javascript():
    return send_from_directory(FRONTEND_DIR, "account.js")

@app.route("/style.css")
def stylesheet():
    return send_from_directory(FRONTEND_DIR, "style.css")


@app.route("/script.js")
def javascript():
    return send_from_directory(FRONTEND_DIR, "script.js")


# ========== RFID SCANNING ==========

@app.route("/api/scan", methods=["POST"])
def scan_tag():
    data = request.get_json(silent=True) or {}

    with lock:
        load_products_from_database()
        result = process_epc(data.get("epc"))

    if result["status"] == "invalid":
        return jsonify({"error": "Invalid EPC"}), 400

    if result["status"] == "unknown":
        return jsonify({
            "message": "Unknown product",
            "epc": result["epc"]
        }), 404

    messages = {
        "added": "Product added successfully",
        "duplicate": "Product already scanned",
        "removed": "Product removed from current session",
        "out_of_stock": "This product is out of stock"
    }

    return jsonify({
        "message": messages[result["status"]],
        "epc": result["epc"],
        "product": products[result["epc"]],
        "status": result["status"]
    })


@app.route("/api/scan/batch", methods=["POST"])
def scan_batch():
    data = request.get_json(silent=True) or {}
    epcs = data.get("epcs")

    if not isinstance(epcs, list):
        return jsonify({"error": "Expected a list of EPCs"}), 400

    with lock:
        load_products_from_database()
        results = [process_epc(epc) for epc in epcs]

    return jsonify({"results": results})


@app.route("/api/tags", methods=["GET"])
def get_tags():
    with lock:
        return jsonify(scanned_tags.copy())


@app.route("/api/rfid/discovered", methods=["GET"])
def get_discovered_tags():
    with lock:
        return jsonify({
            "count": len(discovered_tags),
            "epcs": sorted(discovered_tags)
        })


# ========== SHOPPING CART ==========

@app.route("/api/cart", methods=["GET"])
def get_cart():
    with lock:
        return jsonify(get_cart_data())


@app.route("/api/cart/remove", methods=["POST"])
def remove_cart_item():
    data = request.get_json(silent=True) or {}
    epc = normalize_epc(data.get("epc"))

    if not epc:
        return jsonify({"error": "Invalid EPC"}), 400

    with lock:
        if epc not in scanned_tags:
            return jsonify({"error": "Item not in cart"}), 404

        scanned_tags.remove(epc)
        removed_tags.add(epc)

        return jsonify({
            "message": "Item removed successfully",
            "cart": get_cart_data()
        })


@app.route("/api/cart/clear", methods=["POST"])
def clear_cart():
    with lock:
        # Keep removed EPCs blocked until a new session starts
        removed_tags.update(scanned_tags)
        scanned_tags.clear()

        return jsonify({
            "message": "Cart cleared successfully",
            "item_count": 0,
            "total": 0
        })


@app.route("/api/cart/new", methods=["POST"])
def new_cart_session():
    with lock:
        scanned_tags.clear()
        removed_tags.clear()

        return jsonify({
            "message": "New shopping session started",
            "cart": get_cart_data()
        })

# ========== PRODUCT REGISTRATION ==========

@app.route("/api/products", methods=["GET"])
def list_products():
    with lock:
        load_products_from_database()

        return jsonify({
            "count": len(products),
            "products": products
        })


@app.route("/api/products/register", methods=["POST"])
def register_product():

    # Only administrators can register products.
    if "user_id" not in session:
        return jsonify({"error": "Please log in first."}), 401

    connection = get_database_connection()

    try:
        admin = connection.execute(
            "SELECT role FROM users WHERE user_id = ?",
            (session["user_id"],)
        ).fetchone()

        if not admin or admin["role"] != 1:
            return jsonify({"error": "Administrator access required."}), 403

    finally:
        connection.close()

    data = request.get_json(silent=True) or {}

    epc = normalize_epc(data.get("epc"))
    name = data.get("name")
    category = data.get("category")
    upc = data.get("upc")
    producer_company = data.get("producer_company")

    if not epc:
        return jsonify({"error": "Invalid EPC"}), 400

    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Invalid product name"}), 400

    # Validate optional text fields.
    for field_name, value in (
        ("category", category),
        ("upc", upc),
        ("producer_company", producer_company)
    ):
        if value is not None and not isinstance(value, str):
            return jsonify({"error": f"Invalid {field_name}"}), 400

    category = category.strip() or None if category is not None else None
    upc = upc.strip() or None if upc is not None else None
    producer_company = (
        producer_company.strip() or None
        if producer_company is not None else None
    )

    try:
        price = Decimal(str(data.get("price")))

        if not price.is_finite() or not Decimal("0") <= price <= Decimal("100000"):
            return jsonify({"error": "Invalid price"}), 400

        price = price.quantize(Decimal("0.01"))

    except (InvalidOperation, TypeError, ValueError):
        return jsonify({"error": "Invalid price"}), 400

    connection = get_database_connection()

    try:
        connection.execute("BEGIN IMMEDIATE")

        # Make sure this EPC has not already been registered.
        existing = connection.execute(
            "SELECT product_id FROM products WHERE epc = ?",
            (epc,)
        ).fetchone()

        if existing:
            connection.rollback()
            return jsonify({"error": "This EPC is already assigned."}), 409

        # One database row represents one physical tagged item.
        cursor = connection.execute(
            """
            INSERT INTO products (
                name,
                category,
                price,
                upc,
                epc,
                producer_company,
                stock
            )
            VALUES (?, ?, ?, ?, ?, ?, 1)
            """,
            (
                name.strip(),
                category,
                float(price),
                upc,
                epc,
                producer_company
            )
        )

        product_id = cursor.lastrowid

        connection.commit()

        product = {
            "product_id": product_id,
            "name": name.strip(),
            "category": category,
            "price": float(price),
            "upc": upc,
            "epc": epc,
            "producer_company": producer_company,
            "stock": 1
        }

        with lock:
            products[epc] = product
            save_epc(epc)

        return jsonify({
            "message": "Product registered successfully",
            "product": product
        }), 201

    except sqlite3.IntegrityError:
        connection.rollback()
        return jsonify({"error": "This EPC is already assigned."}), 409

    except sqlite3.Error:
        connection.rollback()
        app.logger.exception("Could not register RFID product")
        return jsonify({"error": "Could not register product."}), 500

    finally:
        connection.close()

def load_products_from_database():
    connection = get_database_connection()

    try:
        rows = connection.execute("""
            SELECT
                product_id,
                name,
                category,
                price,
                upc,
                epc,
                producer_company,
                stock
            FROM products
            WHERE epc IS NOT NULL
        """).fetchall()

        products.clear()

        for row in rows:
            epc = normalize_epc(row["epc"])

            if epc:
                products[epc] = dict(row)

    finally:
        connection.close()

# ========== MEMBERSHIP CARD (ESP32 + RC522 over MQTT) ==========

@app.route("/api/membership/last-card", methods=["GET"])
def last_membership_card():
    return jsonify(membership_mqtt.get_last_card())


# Load saved EPCs and product assignments
load_data()

if __name__ == "__main__":
    # Listen for membership cards tapped on the ESP32 reader
    membership_mqtt.start()

    app.run(host="0.0.0.0", port=5001)
