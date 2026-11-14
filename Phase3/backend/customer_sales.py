"""
Customer accounts and sales blueprint for SmartStore.

Expected existing SQLite tables:
  users(user_id, name, email, membership_number, card_id, points, role, password_hash)
  products(product_id, name, category, price, upc, epc, producer_company, stock)
  "transaction"(transaction_id, user_id, date, total, points_earned)
  purchase_items(purchase_item_id, product_id, transaction_id, quantity, price)

This module does not create a second Flask app or a second database.
"""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps

from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash


customer_sales = Blueprint("customer_sales", __name__)


def _db_path():
    path = current_app.config.get("SMARTSTORE_DB_PATH") or os.environ.get("SMARTSTORE_DB_PATH")
    if not path:
        raise RuntimeError(
            "SMARTSTORE_DB_PATH is not configured. Point it to the same smartstore.db "
            "file used by the existing SmartStore database.py."
        )
    if not os.path.isfile(path):
        raise RuntimeError(f"SmartStore database file does not exist: {path}")
    return path


def get_db():
    connection = sqlite3.connect(_db_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _json_error(message, status=400):
    return jsonify({"error": message}), status


def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return _json_error("Please log in to continue.", 401)
        return function(*args, **kwargs)
    return wrapper


def _public_user(row):
    return {
        "user_id": row["user_id"],
        "name": row["name"],
        "email": row["email"],
        "membership_number": row["membership_number"],
        "card_id": row["card_id"],
        "points": row["points"],
        "role": row["role"],
    }


def _make_membership_number(connection):
    # Retry in the extremely unlikely event of a collision.
    for _ in range(20):
        candidate = "SS-" + secrets.token_hex(5).upper()
        exists = connection.execute(
            "SELECT 1 FROM users WHERE membership_number = ?", (candidate,)
        ).fetchone()
        if not exists:
            return candidate
    raise RuntimeError("Could not generate a unique membership number.")


@customer_sales.post("/api/customer/register")
def register_customer():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    card_id = data.get("card_id") or None

    if not isinstance(name, str) or not name.strip():
        return _json_error("Name is required.")
    if not isinstance(email, str) or "@" not in email or len(email) > 254:
        return _json_error("A valid email address is required.")
    if not isinstance(password, str) or len(password) < 8:
        return _json_error("Password must contain at least 8 characters.")

    email = email.strip().lower()
    connection = get_db()
    try:
        existing = connection.execute(
            "SELECT user_id FROM users WHERE lower(email) = ?", (email,)
        ).fetchone()
        if existing:
            return _json_error("An account with this email already exists.", 409)

        membership_number = _make_membership_number(connection)
        cursor = connection.execute(
            """
            INSERT INTO users
                (name, email, membership_number, card_id, points, role, password_hash)
            VALUES (?, ?, ?, ?, 0, 0, ?)
            """,
            (
                name.strip(),
                email,
                membership_number,
                card_id,
                generate_password_hash(password),
            ),
        )
        connection.commit()
        user = connection.execute(
            "SELECT * FROM users WHERE user_id = ?", (cursor.lastrowid,)
        ).fetchone()
        session.clear()
        session["user_id"] = user["user_id"]
        return jsonify({
            "message": "Account created successfully.",
            "customer": _public_user(user),
        }), 201
    except sqlite3.IntegrityError:
        connection.rollback()
        return _json_error("Email or membership/card identifier is already in use.", 409)
    finally:
        connection.close()


@customer_sales.post("/api/customer/login")
def login_customer():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    password = data.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        return _json_error("Email and password are required.")

    connection = get_db()
    try:
        user = connection.execute(
            "SELECT * FROM users WHERE lower(email) = ?", (email.strip().lower(),)
        ).fetchone()
        if not user or not user["password_hash"] or not check_password_hash(
            user["password_hash"], password
        ):
            return _json_error("Email or password is incorrect.", 401)

        session.clear()
        session["user_id"] = user["user_id"]
        return jsonify({
            "message": "Login successful.",
            "customer": _public_user(user),
        })
    finally:
        connection.close()


@customer_sales.post("/api/customer/logout")
def logout_customer():
    session.clear()
    return jsonify({"message": "Logged out successfully."})


@customer_sales.get("/api/customer/me")
@login_required
def current_customer():
    connection = get_db()
    try:
        user = connection.execute(
            "SELECT * FROM users WHERE user_id = ?", (session["user_id"],)
        ).fetchone()
        if not user:
            session.clear()
            return _json_error("Customer account was not found.", 404)
        return jsonify({"customer": _public_user(user)})
    finally:
        connection.close()


@customer_sales.patch("/api/customer/me")
@login_required
def update_customer():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    email = data.get("email")

    if name is not None and (not isinstance(name, str) or not name.strip()):
        return _json_error("Name cannot be empty.")
    if email is not None and (
        not isinstance(email, str) or "@" not in email or len(email) > 254
    ):
        return _json_error("A valid email address is required.")

    connection = get_db()
    try:
        if email is not None:
            email = email.strip().lower()
        connection.execute(
            """
            UPDATE users
            SET name = COALESCE(?, name), email = COALESCE(?, email)
            WHERE user_id = ?
            """,
            (name.strip() if name is not None else None, email, session["user_id"]),
        )
        connection.commit()
        user = connection.execute(
            "SELECT * FROM users WHERE user_id = ?", (session["user_id"],)
        ).fetchone()
        return jsonify({"message": "Profile updated.", "customer": _public_user(user)})
    except sqlite3.IntegrityError:
        connection.rollback()
        return _json_error("That email address is already in use.", 409)
    finally:
        connection.close()


@customer_sales.get("/api/customer/transactions")
@login_required
def customer_purchase_history():
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT transaction_id, date, total, points_earned
            FROM "transaction"
            WHERE user_id = ?
            ORDER BY date DESC, transaction_id DESC
            """,
            (session["user_id"],),
        ).fetchall()
        return jsonify({"transactions": [dict(row) for row in rows]})
    finally:
        connection.close()


@customer_sales.get("/api/customer/transactions/<int:transaction_id>")
@login_required
def customer_transaction_detail(transaction_id):
    connection = get_db()
    try:
        purchase = connection.execute(
            """
            SELECT transaction_id, date, total, points_earned
            FROM "transaction"
            WHERE transaction_id = ? AND user_id = ?
            """,
            (transaction_id, session["user_id"]),
        ).fetchone()
        if not purchase:
            return _json_error("Purchase not found.", 404)

        items = connection.execute(
            """
            SELECT pi.product_id, p.name AS product_name, pi.quantity, pi.price,
                   (pi.quantity * pi.price) AS line_total
            FROM purchase_items AS pi
            JOIN products AS p ON p.product_id = pi.product_id
            WHERE pi.transaction_id = ?
            ORDER BY pi.purchase_item_id
            """,
            (transaction_id,),
        ).fetchall()
        return jsonify({
            "transaction": dict(purchase),
            "items": [dict(item) for item in items],
        })
    finally:
        connection.close()


@customer_sales.post("/api/sales/checkout")
@login_required
def complete_sale():
    """
    Record a completed/simulated checkout.

    Request JSON: {"items":[{"product_id": 1, "quantity": 2}, ...]}
    Prices are always read from the products table, not trusted from the browser.
    Call this only after the checkout/payment step has been approved.
    """
    data = request.get_json(silent=True) or {}
    items = data.get("items")
    if not isinstance(items, list) or not items:
        return _json_error("A non-empty items list is required.")

    quantities = {}
    for item in items:
        if not isinstance(item, dict):
            return _json_error("Each item must contain product_id and quantity.")
        try:
            product_id = int(item.get("product_id"))
            quantity = int(item.get("quantity"))
        except (TypeError, ValueError):
            return _json_error("Product IDs and quantities must be whole numbers.")
        if product_id <= 0 or quantity <= 0:
            return _json_error("Product IDs and quantities must be positive.")
        quantities[product_id] = quantities.get(product_id, 0) + quantity

    connection = get_db()
    try:
        connection.execute("BEGIN IMMEDIATE")
        total_cents = 0
        sale_lines = []

        for product_id, quantity in quantities.items():
            product = connection.execute(
                """
                SELECT product_id, name, price, stock
                FROM products WHERE product_id = ?
                """,
                (product_id,),
            ).fetchone()
            if not product:
                connection.rollback()
                return _json_error(f"Product {product_id} was not found.", 404)
            if product["stock"] < quantity:
                connection.rollback()
                return _json_error(
                    f"Not enough stock for {product['name']}. Available: {product['stock']}.",
                    409,
                )

            try:
                price = Decimal(str(product["price"])).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
            except InvalidOperation:
                connection.rollback()
                return _json_error(f"Invalid stored price for product {product_id}.", 500)

            line_cents = int((price * 100 * quantity).to_integral_value())
            total_cents += line_cents
            sale_lines.append((product_id, quantity, float(price)))

        total = total_cents / 100
        points_earned = total_cents // 100  # 1 point per full $1 spent
        sale_date = datetime.now(timezone.utc).isoformat(timespec="seconds")

        cursor = connection.execute(
            """
            INSERT INTO "transaction" (user_id, date, total, points_earned)
            VALUES (?, ?, ?, ?)
            """,
            (session["user_id"], sale_date, total, points_earned),
        )
        transaction_id = cursor.lastrowid

        for product_id, quantity, price in sale_lines:
            connection.execute(
                """
                INSERT INTO purchase_items
                    (product_id, transaction_id, quantity, price)
                VALUES (?, ?, ?, ?)
                """,
                (product_id, transaction_id, quantity, price),
            )
            connection.execute(
                "UPDATE products SET stock = stock - ? WHERE product_id = ?",
                (quantity, product_id),
            )

        connection.execute(
            "UPDATE users SET points = points + ? WHERE user_id = ?",
            (points_earned, session["user_id"]),
        )
        connection.commit()

        return jsonify({
            "message": "Sale recorded successfully.",
            "transaction_id": transaction_id,
            "date": sale_date,
            "total": total,
            "points_earned": points_earned,
        }), 201
    except sqlite3.Error:
        connection.rollback()
        current_app.logger.exception("Could not record SmartStore sale")
        return _json_error("The sale could not be recorded.", 500)
    finally:
        connection.close()


@customer_sales.get("/api/customer/transactions/<int:transaction_id>/receipt")
@login_required
def get_receipt(transaction_id):
    # Receipt data is generated from the stored transaction and line items.
    connection = get_db()
    try:
        purchase = connection.execute(
            """
            SELECT t.transaction_id, t.date, t.total, t.points_earned,
                   u.name, u.email, u.membership_number
            FROM "transaction" AS t
            JOIN users AS u ON u.user_id = t.user_id
            WHERE t.transaction_id = ? AND t.user_id = ?
            """,
            (transaction_id, session["user_id"]),
        ).fetchone()
        if not purchase:
            return _json_error("Receipt not found.", 404)

        items = connection.execute(
            """
            SELECT p.name, pi.quantity, pi.price,
                   (pi.quantity * pi.price) AS line_total
            FROM purchase_items AS pi
            JOIN products AS p ON p.product_id = pi.product_id
            WHERE pi.transaction_id = ?
            ORDER BY pi.purchase_item_id
            """,
            (transaction_id,),
        ).fetchall()
        return jsonify({
            "receipt": dict(purchase),
            "items": [dict(item) for item in items],
            "note": "Receipt data is generated from the transaction records.",
        })
    finally:
        connection.close()


def init_customer_sales(app, database_path=None):
    """
    Register the blueprint on the existing Flask app.

    database_path must be the exact SQLite file used by the existing app.
    """
    if database_path:
        app.config["SMARTSTORE_DB_PATH"] = str(database_path)
    if not app.secret_key:
        app.secret_key = os.environ.get("SECRET_KEY")
    if not app.secret_key:
        raise RuntimeError(
            "Set SECRET_KEY before enabling customer login sessions."
        )
    app.register_blueprint(customer_sales)
