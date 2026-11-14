import sys
from pathlib import Path

# Locate the parent backend directory
BACKEND_DIR = Path(__file__).resolve().parent.parent

# Allow imports from backend/
sys.path.insert(0, str(BACKEND_DIR))

from database import DATABASE_PATH
from customer_sales import init_customer_sales
import json
import os
from pathlib import Path
from threading import RLock

from flask import Flask, request, jsonify, send_from_directory

from database import DATABASE_PATH
from customer_sales import init_customer_sales


# File locations
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent.parent / "frontend"

EPC_FILE = BASE_DIR / "discovered_epcs.txt"
PRODUCT_FILE = BASE_DIR / "registered_products.json"


# Initialize Flask
app = Flask(__name__)

app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")

if not app.config["SECRET_KEY"]:
    raise RuntimeError("SECRET_KEY environment variable is missing.")

init_customer_sales(
    app,
    database_path=DATABASE_PATH
)

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


def load_data():
    if EPC_FILE.exists():
        for line in EPC_FILE.read_text(
            encoding="utf-8"
        ).splitlines():
            epc = normalize_epc(line)
            if epc:
                discovered_tags.add(epc)


    if PRODUCT_FILE.exists():
        saved = json.loads(
            PRODUCT_FILE.read_text(encoding="utf-8")
        )

        for raw_epc, product in saved.items():
            epc = normalize_epc(raw_epc)

            if epc and isinstance(product, dict):
                products[epc] = product



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
            "epc": epc,
            "name": product["name"],
            "price": price
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
        return {"epc": raw_epc, "status": "invalid"}

    save_epc(epc)

    if epc not in products:
        return {"epc": epc, "status": "unknown"}

    if epc in removed_tags:
        return {"epc": epc, "status": "removed"}

    if epc in scanned_tags:
        return {"epc": epc, "status": "duplicate"}

    scanned_tags.append(epc)

    print("Product scanned:", products[epc]["name"])

    return {
        "epc": epc,
        "status": "added",
        "product": products[epc]
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


@app.route("/style.css")
def stylesheet():
    return send_from_directory(FRONTEND_DIR, "style.css")


@app.route("/script.js")
def javascript():
    return send_from_directory(FRONTEND_DIR, "script.js")


# ========== RFID SCANNING ==========

@app.route("/scan", methods=["POST"])
def scan_tag():
    data = request.get_json(silent=True) or {}

    with lock:
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
        "removed": "Product removed from current session"
    }

    return jsonify({
        "message": messages[result["status"]],
        "epc": result["epc"],
        "product": products[result["epc"]],
        "status": result["status"]
    })


@app.route("/scan/batch", methods=["POST"])
def scan_batch():
    data = request.get_json(silent=True) or {}
    epcs = data.get("epcs")

    if not isinstance(epcs, list):
        return jsonify({"error": "Expected a list of EPCs"}), 400

    with lock:
        results = [process_epc(epc) for epc in epcs]

    return jsonify({"results": results})


@app.route("/tags", methods=["GET"])
def get_tags():
    with lock:
        return jsonify(scanned_tags.copy())


@app.route("/rfid/discovered", methods=["GET"])
def get_discovered_tags():
    with lock:
        return jsonify({
            "count": len(discovered_tags),
            "epcs": sorted(discovered_tags)
        })


# ========== SHOPPING CART ==========

@app.route("/cart", methods=["GET"])
def get_cart():
    with lock:
        return jsonify(get_cart_data())


@app.route("/cart/remove", methods=["POST"])
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


@app.route("/cart/clear", methods=["POST"])
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


@app.route("/cart/new", methods=["POST"])
def new_cart_session():
    with lock:
        scanned_tags.clear()
        removed_tags.clear()

        return jsonify({
            "message": "New shopping session started",
            "cart": get_cart_data()
        })


# ========== PRODUCT REGISTRATION ==========

@app.route("/products", methods=["GET"])
def list_products():
    with lock:
        return jsonify({
            "count": len(products),
            "products": products
        })


@app.route("/products/register", methods=["POST"])
def register_product():
    data = request.get_json(silent=True) or {}

    epc = normalize_epc(data.get("epc"))
    name = data.get("name")
    price = data.get("price")

    if not epc:
        return jsonify({"error": "Invalid EPC"}), 400

    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Invalid product name"}), 400

    try:
        price = float(price)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid price"}), 400

    if not 0 <= price <= 100000:
        return jsonify({"error": "Invalid price"}), 400

    with lock:
        products[epc] = {
            "name": name.strip(),
            "price": round(price, 2)
        }

        save_epc(epc)
        save_products()

    return jsonify({
        "message": "Product registered successfully",
        "epc": epc,
        "product": products[epc]
    })


# Load saved EPCs and product assignments
load_data()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
