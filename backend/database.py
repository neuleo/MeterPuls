import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_DIR = os.getenv("DATA_DIR", "/app/data")
os.makedirs(DATABASE_DIR, exist_ok=True)
DATABASE_URL = f"sqlite:///{os.path.join(DATABASE_DIR, 'meterpulse.db')}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def run_migrations():
    """Ensures newly added columns exist in sqlite tables."""
    with engine.connect() as conn:
        try:
            cursor = conn.connection.cursor()
            cursor.execute("PRAGMA table_info(contracts)")
            columns = [row[1] for row in cursor.fetchall()]
            if columns:
                if "provider_name" not in columns:
                    cursor.execute("ALTER TABLE contracts ADD COLUMN provider_name VARCHAR(100)")
                if "tariff_name" not in columns:
                    cursor.execute("ALTER TABLE contracts ADD COLUMN tariff_name VARCHAR(100)")
                if "bonus_one_time" not in columns:
                    cursor.execute("ALTER TABLE contracts ADD COLUMN bonus_one_time FLOAT DEFAULT 0.0 NOT NULL")
                if "bonus_notes" not in columns:
                    cursor.execute("ALTER TABLE contracts ADD COLUMN bonus_notes VARCHAR(200)")
                if "warmwater_source" not in columns:
                    cursor.execute("ALTER TABLE contracts ADD COLUMN warmwater_source VARCHAR(50) DEFAULT 'electricity'")
                if "heating_start_month" not in columns:
                    cursor.execute("ALTER TABLE contracts ADD COLUMN heating_start_month INTEGER DEFAULT 10")
                if "heating_end_month" not in columns:
                    cursor.execute("ALTER TABLE contracts ADD COLUMN heating_end_month INTEGER DEFAULT 4")
                conn.connection.commit()
        except Exception as e:
            print(f"Migration notice: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
