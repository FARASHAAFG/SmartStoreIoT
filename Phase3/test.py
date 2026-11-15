import sqlite3
from werkzeug.security import generate_password_hash

DATABASE_PATH = r"C:\Users\karim\OneDrive\Desktop\SmartStoreIoT\Phase3\database\smartstore.db"

connection = sqlite3.connect(DATABASE_PATH)

connection.execute("""
    INSERT INTO users (
        name,
        email,
        membership_number,
        card_id,
        points,
        role,
        password_hash
    )
    VALUES (?, ?, ?, NULL, 0, 1, ?)
""", (
    "Store Administrator",
    "admin@smartstore.com",
    "SS-ADMIN001",
    generate_password_hash("AdminPassword123")
))

connection.commit()
connection.close()

print("Administrator account created!")