import sqlite3
import os


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_PATH = os.path.join(BASE_DIR, "database", "smartstore.db")


def create_database():

    connection = sqlite3.connect(DATABASE_PATH)
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS thresholds (
            fridge TEXT PRIMARY KEY,
            threshold REAL NOT NULL
        )
    """)

    # Default threshold of 25 °C for each fridge (only added the first time)
    cursor.execute("INSERT OR IGNORE INTO thresholds VALUES ('Frig1', 25)")
    cursor.execute("INSERT OR IGNORE INTO thresholds VALUES ('Frig2', 25)")

    connection.commit()
    connection.close()

    print("Database created successfully")


def get_threshold(fridge):

    connection = sqlite3.connect(DATABASE_PATH)
    cursor = connection.cursor()

    cursor.execute("SELECT threshold FROM thresholds WHERE fridge = ?", (fridge,))
    row = cursor.fetchone()

    connection.close()
    return row[0]


def set_threshold(fridge, threshold):

    connection = sqlite3.connect(DATABASE_PATH)
    cursor = connection.cursor()

    cursor.execute("UPDATE thresholds SET threshold = ? WHERE fridge = ?", (threshold, fridge))

    connection.commit()
    connection.close()


if __name__ == "__main__":
    create_database()
