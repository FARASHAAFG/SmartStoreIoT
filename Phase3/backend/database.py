import sqlite3
import os


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_PATH = os.path.join(BASE_DIR, "database", "smartstore.db")


def create_database():

    connection = sqlite3.connect(DATABASE_PATH)
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT NOT NULL,
            telephone TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE
        )
    """)

    connection.commit()
    connection.close()

    print("Database created successfully")


if __name__ == "__main__":
    create_database()