import sqlite3
from database import DATABASE_PATH

connection = sqlite3.connect(DATABASE_PATH)

columns = connection.execute(
    'PRAGMA table_info("transaction")'
).fetchall()

for column in columns:
    if column[1] == "user_id":
        print(column)

connection.close()