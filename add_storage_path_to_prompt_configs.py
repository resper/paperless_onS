#!/usr/bin/env python3
"""
Migration script to add storage_path column to prompt_configurations table
"""
import sqlite3
import sys
from pathlib import Path

# Path to database
DB_PATH = Path(__file__).parent / "paperless_ons.db"


def add_storage_path_column():
    """Add storage_path column to prompt_configurations table"""

    if not DB_PATH.exists():
        print(f"❌ Database not found at {DB_PATH}")
        print("   Please run the application first to create the database.")
        return False

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Check if column already exists
        cursor.execute("PRAGMA table_info(prompt_configurations)")
        columns = [col[1] for col in cursor.fetchall()]

        if "storage_path" in columns:
            print("✓ Column 'storage_path' already exists in prompt_configurations table")
            conn.close()
            return True

        # Add the column
        print("Adding 'storage_path' column to prompt_configurations table...")
        cursor.execute("""
            ALTER TABLE prompt_configurations
            ADD COLUMN storage_path TEXT
        """)

        conn.commit()
        conn.close()

        print("✓ Successfully added 'storage_path' column to prompt_configurations table")
        return True

    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False


if __name__ == "__main__":
    success = add_storage_path_column()
    sys.exit(0 if success else 1)
