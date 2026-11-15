"""
Product + inventory management blueprint for SmartStore (admin only).

Model
-----
products      : one row per product DEFINITION (name, category, price, UPC, ...)
                products.epc = the product's first tag (kept for compatibility)
                products.stock = units in stock (checkout subtracts from it)
product_tags  : every physical RFID tag (EPC) that belongs to a product
receptions    : every stock reception (quantity + date)

Receiving stock = registering N new EPC tags for an existing product:
  receptions row + N product_tags rows + products.stock += N  (one transaction)
"""

import re
import sqlite3
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from functools import wraps

from flask import Blueprint, current_app, jsonify, request, session

inventory = Blueprint("inventory", __name__)

LOW_STOCK_LIMIT = 5


# ---------- helpers ----------

def _db():
    connection = sqlite3.connect(current_app.config["SMARTSTORE_DB_PATH"])
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _error(code, message, status=400, **extra):
    """code = stable key the frontend translates (EN/FR); message = English."""
    return jsonify({"error": message, "code": code, **extra}), status


def _fail(problem):
    """problem = (code, message) or (code, message, {extra fields})."""
    code, message, *rest = problem
    return _error(code, message, 400, **(rest[0] if rest else {}))


def admin_only(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return _error("login_required", "Please log in first.", 401)

        connection = _db()
        try:
            user = connection.execute(
                "SELECT role FROM users WHERE user_id = ?", (session["user_id"],)
            ).fetchone()
        finally:
            connection.close()

        if not user or user["role"] != 1:
            return _error("admin_required", "Administrator access required.", 403)
        return function(*args, **kwargs)
    return wrapper


def normalize_epc(value):
    if not isinstance(value, str):
        return None
    epc = "".join(value.split()).upper()
    if not epc or len(epc) > 24:
        return None
    if not all(c in "0123456789ABCDEF" for c in epc):
        return None
    return epc


def clean_text(value, maximum=100):
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if value and len(value) <= maximum else None


def parse_product_fields(data):
    """Validate name/category/price/upc/producer. Returns (fields, error_tuple)."""
    name = clean_text(data.get("name"))
    if not name:
        return None, ("invalid_name", "Product name is required (max 100 characters).")

    category = clean_text(data.get("category"), 60)
    if not category:
        return None, ("invalid_category", "Category is required.")

    producer = clean_text(data.get("producer_company"))
    if not producer:
        return None, ("invalid_producer", "Producer company is required.")

    upc = data.get("upc")
    upc = upc.strip() if isinstance(upc, str) else ""
    if not re.fullmatch(r"\d{1,13}", upc):
        return None, ("invalid_upc", "UPC must be 1 to 13 digits.")

    try:
        price = Decimal(str(data.get("price")))
        if not price.is_finite() or not Decimal("0") <= price <= Decimal("100000"):
            raise InvalidOperation
        price = float(price.quantize(Decimal("0.01")))
    except (InvalidOperation, ValueError, TypeError):
        return None, ("invalid_price", "Price must be a number between 0 and 100000.")

    return {
        "name": name, "category": category, "producer_company": producer,
        "upc": upc, "price": price,
    }, None


def parse_epc_list(data):
    """Returns (epcs, error_tuple). Rejects invalid and duplicate EPCs."""
    raw = data.get("epcs")
    if not isinstance(raw, list) or not raw:
        return None, ("epc_required", "Add at least one EPC tag.")
    if len(raw) > 500:
        return None, ("too_many_epcs", "At most 500 tags per reception.")

    epcs, seen = [], set()
    for item in raw:
        epc = normalize_epc(item)
        if not epc:
            return None, ("invalid_epc",
                          f"Invalid EPC: {item} (hex characters only, max 24).",
                          {"detail": str(item)[:40]})
        if epc in seen:
            return None, ("duplicate_epc", f"EPC listed twice: {epc}.",
                          {"detail": epc})
        seen.add(epc)
        epcs.append(epc)
    return epcs, None


def parse_date(value):
    if value in (None, ""):
        return date.today().isoformat(), None
    try:
        parsed = datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        return None, ("invalid_date", "Date must be YYYY-MM-DD.")
    if parsed > date.today():
        return None, ("future_date", "Reception date cannot be in the future.")
    return parsed.isoformat(), None


def find_taken_epcs(connection, epcs):
    marks = ",".join("?" * len(epcs))
    rows = connection.execute(
        f"SELECT epc FROM product_tags WHERE epc IN ({marks}) "
        f"UNION SELECT epc FROM products WHERE epc IN ({marks})",
        epcs + epcs,
    ).fetchall()
    return [row[0] for row in rows]


PRODUCT_SELECT = """
    SELECT
        p.product_id, p.name, p.category, p.price, p.upc, p.epc,
        p.producer_company, p.stock,
        COALESCE((SELECT SUM(quantity) FROM receptions r
                  WHERE r.product_id = p.product_id), 0) AS total_received,
        (SELECT MAX(date_received) FROM receptions r
         WHERE r.product_id = p.product_id)               AS last_received,
        (SELECT COUNT(*) FROM product_tags t
         WHERE t.product_id = p.product_id)               AS tag_count
    FROM products p
"""


def product_dict(row):
    item = dict(row)
    item["low_stock"] = item["stock"] <= LOW_STOCK_LIMIT
    return item


# ---------- routes ----------

@inventory.get("/api/admin/me")
@admin_only
def admin_me():
    return jsonify({"ok": True, "low_stock_limit": LOW_STOCK_LIMIT})


@inventory.get("/api/admin/products")
@admin_only
def list_products_admin():
    search = (request.args.get("q") or "").strip()
    connection = _db()
    try:
        if search:
            like = f"%{search}%"
            rows = connection.execute(
                PRODUCT_SELECT
                + " WHERE p.name LIKE ? OR p.category LIKE ? OR p.upc LIKE ?"
                  " OR p.producer_company LIKE ? ORDER BY p.name",
                (like, like, like, like),
            ).fetchall()
        else:
            rows = connection.execute(PRODUCT_SELECT + " ORDER BY p.name").fetchall()
        products = [product_dict(r) for r in rows]
    finally:
        connection.close()

    return jsonify({
        "products": products,
        "summary": {
            "product_count": len(products),
            "units_in_stock": sum(p["stock"] for p in products),
            "low_stock_count": sum(1 for p in products if 0 < p["stock"] <= LOW_STOCK_LIMIT),
            "out_of_stock_count": sum(1 for p in products if p["stock"] == 0),
            "stock_value": round(sum(p["stock"] * p["price"] for p in products), 2),
        },
    })


@inventory.get("/api/admin/products/by-upc/<upc>")
@admin_only
def product_by_upc(upc):
    connection = _db()
    try:
        row = connection.execute(
            PRODUCT_SELECT + " WHERE p.upc = ?", (upc.strip(),)
        ).fetchone()
    finally:
        connection.close()
    if not row:
        return _error("product_not_found", "No product has this UPC.", 404)
    return jsonify({"product": product_dict(row)})


@inventory.get("/api/admin/tags")
@admin_only
def assigned_tags():
    """All EPCs already used. The page subtracts these from the reader's list."""
    connection = _db()
    try:
        rows = connection.execute(
            "SELECT epc FROM product_tags UNION SELECT epc FROM products "
            "WHERE epc IS NOT NULL"
        ).fetchall()
    finally:
        connection.close()
    return jsonify({"epcs": sorted(r[0] for r in rows)})


@inventory.post("/api/admin/products")
@admin_only
def create_product():
    data = request.get_json(silent=True) or {}

    fields, problem = parse_product_fields(data)
    if problem:
        return _fail(problem)
    epcs, problem = parse_epc_list(data)
    if problem:
        return _fail(problem)
    received, problem = parse_date(data.get("date_received"))
    if problem:
        return _fail(problem)

    connection = _db()
    try:
        connection.execute("BEGIN IMMEDIATE")

        if connection.execute(
            "SELECT 1 FROM products WHERE upc = ?", (fields["upc"],)
        ).fetchone():
            connection.rollback()
            return _error("upc_taken", "This UPC already belongs to another product.", 409)

        taken = find_taken_epcs(connection, epcs)
        if taken:
            connection.rollback()
            return _error("epc_taken", f"EPC already assigned: {taken[0]}.", 409,
                          epcs=taken)

        cursor = connection.execute(
            """INSERT INTO products
               (name, category, price, upc, epc, producer_company, stock)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (fields["name"], fields["category"], fields["price"], fields["upc"],
             epcs[0], fields["producer_company"], 0),   # stock is added by the reception below
        )
        product_id = cursor.lastrowid
        _record_reception(connection, product_id, epcs, received, "Initial stock")
        connection.commit()

        row = connection.execute(
            PRODUCT_SELECT + " WHERE p.product_id = ?", (product_id,)
        ).fetchone()
        return jsonify({"message": "Product added.", "product": product_dict(row)}), 201

    except sqlite3.Error:
        connection.rollback()
        current_app.logger.exception("create_product failed")
        return _error("server_error", "Could not add the product.", 500)
    finally:
        connection.close()


def _record_reception(connection, product_id, epcs, received, note=None):
    cursor = connection.execute(
        "INSERT INTO receptions (product_id, quantity, date_received, note) "
        "VALUES (?, ?, ?, ?)",
        (product_id, len(epcs), received, note),
    )
    reception_id = cursor.lastrowid
    connection.executemany(
        "INSERT INTO product_tags (epc, product_id, reception_id) VALUES (?, ?, ?)",
        [(epc, product_id, reception_id) for epc in epcs],
    )
    connection.execute(
        "UPDATE products SET stock = stock + ? WHERE product_id = ?",
        (len(epcs), product_id),
    )
    return reception_id


@inventory.put("/api/admin/products/<int:product_id>")
@admin_only
def edit_product(product_id):
    data = request.get_json(silent=True) or {}
    fields, problem = parse_product_fields(data)
    if problem:
        return _fail(problem)

    connection = _db()
    try:
        connection.execute("BEGIN IMMEDIATE")

        if not connection.execute(
            "SELECT 1 FROM products WHERE product_id = ?", (product_id,)
        ).fetchone():
            connection.rollback()
            return _error("product_not_found", "Product not found.", 404)

        if connection.execute(
            "SELECT 1 FROM products WHERE upc = ? AND product_id != ?",
            (fields["upc"], product_id),
        ).fetchone():
            connection.rollback()
            return _error("upc_taken", "This UPC already belongs to another product.", 409)

        connection.execute(
            """UPDATE products SET name=?, category=?, price=?, upc=?,
               producer_company=? WHERE product_id=?""",
            (fields["name"], fields["category"], fields["price"], fields["upc"],
             fields["producer_company"], product_id),
        )
        connection.commit()

        row = connection.execute(
            PRODUCT_SELECT + " WHERE p.product_id = ?", (product_id,)
        ).fetchone()
        return jsonify({"message": "Product updated.", "product": product_dict(row)})

    except sqlite3.Error:
        connection.rollback()
        current_app.logger.exception("edit_product failed")
        return _error("server_error", "Could not update the product.", 500)
    finally:
        connection.close()


@inventory.delete("/api/admin/products/<int:product_id>")
@admin_only
def delete_product(product_id):
    connection = _db()
    try:
        connection.execute("BEGIN IMMEDIATE")

        if not connection.execute(
            "SELECT 1 FROM products WHERE product_id = ?", (product_id,)
        ).fetchone():
            connection.rollback()
            return _error("product_not_found", "Product not found.", 404)

        sold = connection.execute(
            "SELECT COUNT(*) FROM purchase_items WHERE product_id = ?", (product_id,)
        ).fetchone()[0]
        if sold:
            connection.rollback()
            return _error(
                "has_sales",
                "This product appears in past purchases and cannot be deleted. "
                "Receipts depend on it.",
                409,
            )

        connection.execute("DELETE FROM product_tags WHERE product_id = ?", (product_id,))
        connection.execute("DELETE FROM receptions WHERE product_id = ?", (product_id,))
        connection.execute("DELETE FROM products WHERE product_id = ?", (product_id,))
        connection.commit()
        return jsonify({"message": "Product deleted."})

    except sqlite3.Error:
        connection.rollback()
        current_app.logger.exception("delete_product failed")
        return _error("server_error", "Could not delete the product.", 500)
    finally:
        connection.close()


@inventory.post("/api/admin/products/<int:product_id>/receive")
@admin_only
def receive_stock(product_id):
    data = request.get_json(silent=True) or {}
    epcs, problem = parse_epc_list(data)
    if problem:
        return _fail(problem)
    received, problem = parse_date(data.get("date_received"))
    if problem:
        return _fail(problem)

    connection = _db()
    try:
        connection.execute("BEGIN IMMEDIATE")

        if not connection.execute(
            "SELECT 1 FROM products WHERE product_id = ?", (product_id,)
        ).fetchone():
            connection.rollback()
            return _error("product_not_found", "Product not found.", 404)

        taken = find_taken_epcs(connection, epcs)
        if taken:
            connection.rollback()
            return _error("epc_taken", f"EPC already assigned: {taken[0]}.", 409,
                          epcs=taken)

        _record_reception(connection, product_id, epcs, received)
        connection.commit()

        row = connection.execute(
            PRODUCT_SELECT + " WHERE p.product_id = ?", (product_id,)
        ).fetchone()
        return jsonify({
            "message": "Stock received.",
            "quantity": len(epcs),
            "product": product_dict(row),
        }), 201

    except sqlite3.Error:
        connection.rollback()
        current_app.logger.exception("receive_stock failed")
        return _error("server_error", "Could not receive the stock.", 500)
    finally:
        connection.close()


@inventory.get("/api/admin/products/<int:product_id>/receptions")
@admin_only
def reception_history(product_id):
    connection = _db()
    try:
        rows = connection.execute(
            """SELECT reception_id, quantity, date_received, note
               FROM receptions WHERE product_id = ?
               ORDER BY date_received DESC, reception_id DESC""",
            (product_id,),
        ).fetchall()
    finally:
        connection.close()
    return jsonify({"receptions": [dict(r) for r in rows]})


def init_inventory(app, database_path=None):
    """Register on the existing Flask app (same pattern as init_customer_sales)."""
    if database_path:
        app.config["SMARTSTORE_DB_PATH"] = str(database_path)
    app.register_blueprint(inventory)
