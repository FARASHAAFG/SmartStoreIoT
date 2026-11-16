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
from email_receipt import send_purchase_receipt

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


def _json_error(message, status=400, code=None):
    body = {"error": message}
    if code:
        # Machine-readable code: lets the front end show a translated message.
        body["code"] = code
    return jsonify(body), status

def normalize_card_uid(value):
    """
    Normalize an RFID card UID.

    Example:
      "A5 C7 4D 06" -> "A5C74D06"
    """
    if not isinstance(value, str):
        return None

    uid = value.replace(" ", "").replace(":", "").replace("-", "").upper()

    if not uid or len(uid) > 32:
        return None

    if not all(character in "0123456789ABCDEF" for character in uid):
        return None

    return uid


def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return _json_error("Please log in to continue.", 401, "login_required")
        return function(*args, **kwargs)
    return wrapper

def admin_required(function):
    @wraps(function)
    @login_required
    def wrapper(*args, **kwargs):
        connection = get_db()

        try:
            user = connection.execute(
                "SELECT role FROM users WHERE user_id = ?",
                (session["user_id"],),
            ).fetchone()

            if not user or user["role"] != 1:
                return _json_error("Administrator access required.", 403, "admin_required")

        finally:
            connection.close()

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
    card_id = None
    #card_id = data.get("card_id") or None

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

@customer_sales.post("/api/admin/customers/<int:user_id>/card")
@admin_required
def assign_customer_card(user_id):
    data = request.get_json(silent=True) or {}

    card_id = normalize_card_uid(data.get("card_id"))

    if not card_id:
        return _json_error("A valid RFID card UID is required.", 400, "invalid_card_uid")

    connection = get_db()

    try:
        connection.execute("BEGIN IMMEDIATE")

        customer = connection.execute(
            """
            SELECT user_id, name, role
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

        if not customer or customer["role"] != 0:
            connection.rollback()
            return _json_error("Customer account not found.", 404, "customer_not_found")

        existing_card = connection.execute(
            "SELECT user_id FROM users WHERE card_id = ?",
            (card_id,),
        ).fetchone()

        if existing_card:
            connection.rollback()
            return _json_error("This RFID card is already assigned.", 409, "card_taken")

        connection.execute(
            "UPDATE users SET card_id = ? WHERE user_id = ?",
            (card_id, user_id),
        )

        connection.commit()

        return jsonify({
            "message": "RFID card assigned successfully.",
            "customer": {
                "user_id": customer["user_id"],
                "name": customer["name"],
                "card_id": card_id,
            },
        })

    except sqlite3.Error:
        connection.rollback()
        current_app.logger.exception("Could not assign customer RFID card")
        return _json_error("Could not assign RFID card.", 500, "server_error")

    finally:
        connection.close()


@customer_sales.get("/api/admin/customers")
@admin_required
def list_customers():
    """
    Customer accounts (role 0) for the admin "Link membership card" dialog.
    Optional ?q= filters by name, email or membership number.
    """
    query = (request.args.get("q") or "").strip().lower()

    sql = """
        SELECT user_id, name, email, membership_number, card_id
        FROM users
        WHERE role = 0
    """
    params = []

    if query:
        # Escape LIKE wildcards so the search text is matched literally.
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        sql += """
            AND (lower(name) LIKE ? ESCAPE '\\'
              OR lower(email) LIKE ? ESCAPE '\\'
              OR lower(membership_number) LIKE ? ESCAPE '\\')
        """
        params = [pattern, pattern, pattern]

    sql += " ORDER BY name COLLATE NOCASE, user_id LIMIT 50"

    connection = get_db()

    try:
        rows = connection.execute(sql, params).fetchall()
        return jsonify({"customers": [dict(row) for row in rows]})
    finally:
        connection.close()


@customer_sales.post("/api/customer/card/scan")
def scan_customer_card():
    data = request.get_json(silent=True) or {}

    card_id = normalize_card_uid(data.get("card_id"))

    if not card_id:
        return _json_error("A valid RFID card UID is required.", 400, "invalid_card_uid")

    connection = get_db()

    try:
        customer = connection.execute(
            """
            SELECT *
            FROM users
            WHERE card_id = ? AND role = 0
            """,
            (card_id,),
        ).fetchone()

        if not customer:
            return _json_error("This RFID card is not assigned to a customer.", 404)

        # Start a customer session after successful card recognition.
        session.clear()
        session["user_id"] = customer["user_id"]

        return jsonify({
            "message": "Customer recognized successfully.",
            "customer": _public_user(customer),
        })

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


# @customer_sales.post("/api/sales/checkout")
# @login_required
# def complete_sale():
#     """
#     Record a completed/simulated checkout.

#     Request JSON: {"items":[{"product_id": 1, "quantity": 2}, ...]}
#     Prices are always read from the products table, not trusted from the browser.
#     Call this only after the checkout/payment step has been approved.
#     """
#     data = request.get_json(silent=True) or {}
#     items = data.get("items")
#     if not isinstance(items, list) or not items:
#         return _json_error("A non-empty items list is required.")

#     quantities = {}
#     for item in items:
#         if not isinstance(item, dict):
#             return _json_error("Each item must contain product_id and quantity.")
#         try:
#             product_id = int(item.get("product_id"))
#             quantity = int(item.get("quantity"))
#         except (TypeError, ValueError):
#             return _json_error("Product IDs and quantities must be whole numbers.")
#         if product_id <= 0 or quantity <= 0:
#             return _json_error("Product IDs and quantities must be positive.")
#         quantities[product_id] = quantities.get(product_id, 0) + quantity

#     connection = get_db()
#     try:
#         connection.execute("BEGIN IMMEDIATE")
#         total_cents = 0
#         sale_lines = []

#         for product_id, quantity in quantities.items():
#             product = connection.execute(
#                 """
#                 SELECT product_id, name, price, stock
#                 FROM products WHERE product_id = ?
#                 """,
#                 (product_id,),
#             ).fetchone()
#             if not product:
#                 connection.rollback()
#                 return _json_error(f"Product {product_id} was not found.", 404)
#             if product["stock"] < quantity:
#                 connection.rollback()
#                 return _json_error(
#                     f"Not enough stock for {product['name']}. Available: {product['stock']}.",
#                     409,
#                 )

#             try:
#                 price = Decimal(str(product["price"])).quantize(
#                     Decimal("0.01"), rounding=ROUND_HALF_UP
#                 )
#             except InvalidOperation:
#                 connection.rollback()
#                 return _json_error(f"Invalid stored price for product {product_id}.", 500)

#             line_cents = int((price * 100 * quantity).to_integral_value())
#             total_cents += line_cents
#             sale_lines.append((product_id, quantity, float(price)))

#         total = total_cents / 100
#         points_earned = total_cents // 100  # 1 point per full $1 spent
#         sale_date = datetime.now(timezone.utc).isoformat(timespec="seconds")

#         cursor = connection.execute(
#             """
#             INSERT INTO "transaction" (user_id, date, total, points_earned)
#             VALUES (?, ?, ?, ?)
#             """,
#             (session["user_id"], sale_date, total, points_earned),
#         )
#         transaction_id = cursor.lastrowid

#         for product_id, quantity, price in sale_lines:
#             connection.execute(
#                 """
#                 INSERT INTO purchase_items
#                     (product_id, transaction_id, quantity, price)
#                 VALUES (?, ?, ?, ?)
#                 """,
#                 (product_id, transaction_id, quantity, price),
#             )
#             connection.execute(
#                 "UPDATE products SET stock = stock - ? WHERE product_id = ?",
#                 (quantity, product_id),
#             )

#         connection.execute(
#             "UPDATE users SET points = points + ? WHERE user_id = ?",
#             (points_earned, session["user_id"]),
#         )
#         connection.commit()

#         return jsonify({
#             "message": "Sale recorded successfully.",
#             "transaction_id": transaction_id,
#             "date": sale_date,
#             "total": total,
#             "points_earned": points_earned,
#         }), 201
#     except sqlite3.Error:
#         connection.rollback()
#         current_app.logger.exception("Could not record SmartStore sale")
#         return _json_error("The sale could not be recorded.", 500)
#     finally:
#         connection.close()


@customer_sales.post("/api/sales/checkout")
def complete_sale():
    """
    Record a completed/simulated checkout.

    Request JSON:
    {
        "items": [
            {"product_id": 1, "quantity": 2}
        ]
    }

    Membership is optional:
    - Recognized customer session: purchase is linked to that customer.
    - No recognized customer session: purchase is recorded as a guest sale.

    Prices are always read from the database.
    """

    data = request.get_json(silent=True) or {}
    items = data.get("items")

    if not isinstance(items, list) or not items:
        return _json_error("A non-empty items list is required.")

    # Combine quantities for repeated product IDs.
    quantities = {}

    for item in items:
        if not isinstance(item, dict):
            return _json_error(
                "Each item must contain product_id and quantity."
            )

        try:
            product_id = int(item.get("product_id"))
            quantity = int(item.get("quantity"))
        except (TypeError, ValueError):
            return _json_error(
                "Product IDs and quantities must be whole numbers."
            )

        if product_id <= 0 or quantity <= 0:
            return _json_error(
                "Product IDs and quantities must be positive."
            )

        quantities[product_id] = quantities.get(product_id, 0) + quantity

    connection = get_db()

    try:
        # Determine whether a customer is attached to this purchase.
        customer_id = session.get("user_id")

        if customer_id is not None:
            customer = connection.execute(
                """
                SELECT user_id, role
                FROM users
                WHERE user_id = ?
                """,
                (customer_id,),
            ).fetchone()

            # Only an existing customer account can receive points.
            if not customer or customer["role"] != 0:
                customer_id = None
                session.pop("user_id", None)

        connection.execute("BEGIN IMMEDIATE")

        total_cents = 0
        sale_lines = []

        # Validate products, prices, and available stock.
        for product_id, quantity in quantities.items():

            product = connection.execute(
                """
                SELECT product_id, name, price, stock
                FROM products
                WHERE product_id = ?
                """,
                (product_id,),
            ).fetchone()

            if not product:
                connection.rollback()
                return _json_error(
                    f"Product {product_id} was not found.",
                    404
                )

            if product["stock"] < quantity:
                connection.rollback()
                return _json_error(
                    f"Not enough stock for {product['name']}. "
                    f"Available: {product['stock']}.",
                    409
                )

            try:
                price = Decimal(str(product["price"])).quantize(
                    Decimal("0.01"),
                    rounding=ROUND_HALF_UP
                )
            except InvalidOperation:
                connection.rollback()
                return _json_error(
                    f"Invalid stored price for product {product_id}.",
                    500
                )

            line_cents = int(
                (price * 100 * quantity).to_integral_value()
            )

            total_cents += line_cents

            sale_lines.append(
                (product_id, quantity, float(price))
            )

        # Calculate the final amount and loyalty points.
        total = total_cents / 100

        if customer_id is not None:
            points_earned = total_cents // 100
        else:
            points_earned = 0

        sale_date = datetime.now(timezone.utc).isoformat(
            timespec="seconds"
        )

        # Create the transaction.
        cursor = connection.execute(
            """
            INSERT INTO "transaction"
                (user_id, date, total, points_earned)
            VALUES (?, ?, ?, ?)
            """,
            (
                customer_id,
                sale_date,
                total,
                points_earned
            ),
        )

        transaction_id = cursor.lastrowid

        # Record each purchased product and update its stock.
        for product_id, quantity, price in sale_lines:

            connection.execute(
                """
                INSERT INTO purchase_items
                    (product_id, transaction_id, quantity, price)
                VALUES (?, ?, ?, ?)
                """,
                (
                    product_id,
                    transaction_id,
                    quantity,
                    price
                ),
            )

            connection.execute(
                """
                UPDATE products
                SET stock = stock - ?
                WHERE product_id = ?
                """,
                (quantity, product_id),
            )

        # Award loyalty points only to registered customers.
        if customer_id is not None:
            connection.execute(
                """
                UPDATE users
                SET points = points + ?
                WHERE user_id = ?
                """,
                (points_earned, customer_id),
            )

        # connection.commit()

        # return jsonify({
        #     "message": "Sale recorded successfully.",
        #     "transaction_id": transaction_id,
        #     "date": sale_date,
        #     "total": total,
        #     "points_earned": points_earned,
        #     "customer_id": customer_id,
        #     "guest_checkout": customer_id is None,
        # }), 201


        # Save the transaction before attempting to send an email.
        connection.commit()

        # Email receipts are only sent to registered customers.
        email_sent = False

        if customer_id is not None:

            # Retrieve the customer's contact information.
            customer_info = connection.execute(
                """
                SELECT name, email, membership_number
                FROM users
                WHERE user_id = ?
                """,
                (customer_id,)
            ).fetchone()

            # Retrieve the purchased products for the receipt.
            receipt_items = connection.execute(
                """
                SELECT
                    p.name,
                    pi.quantity,
                    pi.price,
                    (pi.quantity * pi.price) AS line_total
                FROM purchase_items AS pi
                JOIN products AS p
                    ON p.product_id = pi.product_id
                WHERE pi.transaction_id = ?
                ORDER BY pi.purchase_item_id
                """,
                (transaction_id,)
            ).fetchall()

            try:
                if customer_info and customer_info["email"]:

                    send_purchase_receipt(
                        recipient_email=customer_info["email"],
                        customer_name=customer_info["name"],
                        transaction_id=transaction_id,
                        sale_date=sale_date,
                        total=total,
                        points_earned=points_earned,
                        items=[dict(item) for item in receipt_items],
                        membership_number=customer_info["membership_number"]
                    )

                    email_sent = True

            except Exception:
                # Email failure must not undo a completed purchase.
                current_app.logger.exception(
                    "Could not send receipt for transaction #%s",
                    transaction_id
                )

        return jsonify({
            "message": "Sale recorded successfully.",
            "transaction_id": transaction_id,
            "date": sale_date,
            "total": total,
            "points_earned": points_earned,
            "customer_id": customer_id,
            "guest_checkout": customer_id is None,
            "email_sent": email_sent
        }), 201


    except sqlite3.Error:
        connection.rollback()
        current_app.logger.exception(
            "Could not record SmartStore sale"
        )
        return _json_error(
            "The sale could not be recorded.",
            500
        )

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
