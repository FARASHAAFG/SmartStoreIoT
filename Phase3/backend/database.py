
import sqlite3
import os


# ==========================================
# DATABASE LOCATION
# ==========================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATABASE_PATH = os.path.join(
    BASE_DIR,
    "database",
    "smartstore.db"
)


# ==========================================
# DATABASE INITIALIZATION
# ==========================================

def create_database():

    # Make sure the database directory exists.
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)

    connection = sqlite3.connect(DATABASE_PATH)

    # Enable foreign key enforcement.
    connection.execute("PRAGMA foreign_keys = ON")

    cursor = connection.cursor()

    try:

        # ==========================================
        # 1. USERS TABLE
        # ==========================================

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                membership_number TEXT NOT NULL UNIQUE,
                card_id TEXT UNIQUE,
                points INTEGER NOT NULL DEFAULT 0,
                role INTEGER NOT NULL DEFAULT 0,
                password_hash TEXT NOT NULL
            )
        """)

        # ==========================================
        # 2. PRODUCTS TABLE
        # ==========================================

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS products (
                product_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT,
                price REAL NOT NULL CHECK (price >= 0),
                upc TEXT UNIQUE,
                epc TEXT UNIQUE,
                producer_company TEXT,
                stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
            )
        """)

        # ==========================================
        # 3. TRANSACTION TABLE
        # ==========================================

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS "transaction" (
                transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                total REAL NOT NULL CHECK (total >= 0),
                points_earned INTEGER NOT NULL DEFAULT 0,

                FOREIGN KEY (user_id)
                    REFERENCES users(user_id)
            )
        """)

        # ==========================================
        # 4. PURCHASE ITEMS TABLE
        # ==========================================

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS purchase_items (
                purchase_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                transaction_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                price REAL NOT NULL CHECK (price >= 0),

                FOREIGN KEY (product_id)
                    REFERENCES products(product_id),

                FOREIGN KEY (transaction_id)
                    REFERENCES "transaction"(transaction_id)
            )
        """)

        # ==========================================
        # INDEXES
        # ==========================================

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_transaction_user
            ON "transaction"(user_id)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_purchase_transaction
            ON purchase_items(transaction_id)
        """)

        connection.commit()

        print("SmartStore database initialized successfully.")

    except sqlite3.Error as error:

        connection.rollback()
        print(f"Database initialization failed: {error}")
        raise

    finally:

        connection.close()


# ==========================================
# RUN DATABASE INITIALIZATION
# ==========================================

if __name__ == "__main__":
    connection = sqlite3.connect(DATABASE_PATH)
    cursor = connection.cursor()

    tables = ["users", "products", "transaction", "purchase_items"]

    for table in tables:
        print(f"\n--- {table} ---")

        cursor.execute(f'PRAGMA table_info("{table}")')

        for column in cursor.fetchall():
            print(column)
    cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
    print("Existing records:", cursor.fetchone()[0])
    connection.close()
    