"""
Run ONCE (safe to run again): adds the inventory tables to smartstore.db.

    py migrate_inventory.py

Creates:
  product_tags : every physical RFID tag (EPC) that belongs to a product
  receptions   : every time stock was received (quantity + date)

Existing products keep working: each product's current EPC becomes a tag, and
its current stock is recorded as an "Opening stock" reception.
"""
import sqlite3
from datetime import datetime

from database import DATABASE_PATH, create_database


def migrate():
    create_database()
    connection = sqlite3.connect(DATABASE_PATH)
    connection.execute("PRAGMA foreign_keys = ON")

    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS receptions (
                reception_id  INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id    INTEGER NOT NULL,
                quantity      INTEGER NOT NULL CHECK (quantity > 0),
                date_received TEXT NOT NULL,
                note          TEXT,
                FOREIGN KEY (product_id) REFERENCES products(product_id)
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS product_tags (
                epc          TEXT PRIMARY KEY,
                product_id   INTEGER NOT NULL,
                reception_id INTEGER,
                sold INTEGER NOT NULL DEFAULT 0 CHECK (sold IN (0, 1)),
                FOREIGN KEY (product_id)   REFERENCES products(product_id),
                FOREIGN KEY (reception_id) REFERENCES receptions(reception_id)
            )
        """)
        
        # Add individual RFID tag sale tracking to existing databases.
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(product_tags)")
        }

        if "sold" not in columns:
            connection.execute(
                "ALTER TABLE product_tags "
                "ADD COLUMN sold INTEGER NOT NULL DEFAULT 0 "
                "CHECK (sold IN (0, 1))"
        )

        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_tags_product ON product_tags(product_id)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_receptions_product ON receptions(product_id)"
        )

        # Bring existing products into the new model.
        now = datetime.now().strftime("%Y-%m-%d")
        rows = connection.execute("""
            SELECT product_id, epc, stock FROM products
            WHERE product_id NOT IN (SELECT DISTINCT product_id FROM receptions)
        """).fetchall()

        for product_id, epc, stock in rows:
            reception_id = None
            if stock and stock > 0:
                cursor = connection.execute(
                    "INSERT INTO receptions (product_id, quantity, date_received, note) "
                    "VALUES (?, ?, ?, 'Opening stock')",
                    (product_id, stock, now),
                )
                reception_id = cursor.lastrowid
            if epc:
                connection.execute(
                    "INSERT OR IGNORE INTO product_tags (epc, product_id, reception_id) "
                    "VALUES (?, ?, ?)",
                    (epc, product_id, reception_id),
                )

        connection.commit()
        print("Inventory migration finished.")
    except sqlite3.Error as error:
        connection.rollback()
        print("Migration failed:", error)
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    migrate()
