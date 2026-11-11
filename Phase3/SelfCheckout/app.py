from pathlib import Path
from flask import Flask, request, jsonify

app = Flask(__name__)

scanned_tags = []

EPC_FILE = Path(__file__).with_name("discovered_epcs.txt")

discovered_tags = set()

if EPC_FILE.exists():
    discovered_tags.update(EPC_FILE.read_text().splitlines())

def save_epc(epc):
    if epc not in discovered_tags:
        discovered_tags.add(epc)
        with EPC_FILE.open("a") as file:
            file.write(epc + "\n")

# Temporary products for testing
products = {
    "E2000017221101441890ABCD": {
        "name": "Milk",
        "price": 4.99
    },
    "E20000222222222222222222": {
        "name": "Bread",
        "price": 3.49
    },
    "E20000333333333333333333": {
        "name": "Eggs",
        "price": 5.99
    }
}

@app.route("/scan", methods=["POST"])
def scan_tag():
    data = request.get_json(silent=True) or {}
    epc = data.get("epc")

    if not isinstance(epc, str) or not epc.strip():
        return jsonify({"error": "Missing EPC"}), 400

    epc = epc.strip().upper()
    
    save_epc(epc)

    if epc not in products:
        return jsonify({
            "message": "Unknown product",
            "epc": epc
        }), 404

    product = products[epc]

    if epc in scanned_tags:
        return jsonify({
            "message": "Product already scanned",
            "epc": epc,
            "product": product
        })

    scanned_tags.append(epc)

    print("Product scanned:", product["name"])

    return jsonify({
        "message": "Product added successfully",
        "epc": epc,
        "product": product
    })


@app.route("/tags", methods=["GET"])
def get_tags():
    return jsonify(scanned_tags)


@app.route("/cart", methods=["GET"])
def get_cart():
    cart = []
    total = 0

    for epc in scanned_tags:
        product = products[epc]

        cart.append({
            "epc": epc,
            "name": product["name"],
            "price": product["price"]
        })

        total += product["price"]

    return jsonify({
        "items": cart,
        "total": round(total, 2),
        "item_count": len(cart)
    })
    
@app.route("/cart/clear", methods=["POST"])
def clear_cart():
    scanned_tags.clear()

    return jsonify({
        "message": "Cart cleared successfully",
        "item_count": 0,
        "total": 0
    })
    
@app.route("/scan/batch", methods=["POST"])
def scan_batch():
    data = request.get_json(silent=True) or {}
    epcs = data.get("epcs")

    if not isinstance(epcs, list):
        return jsonify({"error": "Expected a list of EPCs"}), 400

    results = []

    for epc in epcs:
        if not isinstance(epc, str) or not epc.strip():
            results.append({"epc": epc, "status": "invalid"})
            continue

        epc = epc.strip().upper()
        
        save_epc(epc)

        if epc not in products:
            results.append({"epc": epc, "status": "unknown"})
        elif epc in scanned_tags:
            results.append({"epc": epc, "status": "duplicate"})
        else:
            scanned_tags.append(epc)
            results.append({"epc": epc, "status": "added"})

    return jsonify({"results": results})
    
@app.route("/rfid/discovered", methods=["GET"])
def get_discovered_tags():
    return jsonify({
        "count": len(discovered_tags),
        "epcs": sorted(discovered_tags)
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
