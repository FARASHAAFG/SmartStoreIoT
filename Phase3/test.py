"""
Creates the administrator account.
Run from the Phase3 folder:  python3 test.py   (or  py test.py  on Windows)
"""

import sqlite3
import sys
from pathlib import Path

from werkzeug.security import generate_password_hash

# Use the same database as the app, on any computer
sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))
from database import DATABASE_PATH
from migrate_inventory import migrate

# Make sure all the tables exist first
migrate()

connection = sqlite3.connect(DATABASE_PATH)

# INSERT OR IGNORE: running it again does nothing instead of crashing
cursor = connection.execute("""
    INSERT OR IGNORE INTO users (
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

if cursor.rowcount:
    print("Administrator account created!")
else:
    print("Administrator account already exists.")
