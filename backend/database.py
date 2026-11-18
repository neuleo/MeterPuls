import os
import shutil
from datetime import datetime
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_DIR = os.getenv("DATA_DIR", "/app/data")
os.makedirs(DATABASE_DIR, exist_ok=True)
DATABASE_URL = f"sqlite:///{os.path.join(DATABASE_DIR, 'meterpulse.db')}"

DB_FILE = os.path.join(DATABASE_DIR, "meterpulse.db")

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

CONTRACT_COLUMNS = [
    "id", "category", "provider_name", "tariff_name", "start_date", "end_date",
    "base_fee_monthly", "unit_price", "monthly_payment", "bonus_one_time",
    "bonus_notes", "warmwater_source", "heating_start_month", "heating_end_month",
    "created_at", "updated_at"
]

CONTRACT_DEFAULTS = {
    "provider_name": None,
    "tariff_name": None,
    "end_date": None,
    "base_fee_monthly": 0.0,
    "unit_price": 0.0,
    "monthly_payment": 0.0,
    "bonus_one_time": 0.0,
    "bonus_notes": None,
    "warmwater_source": "electricity",
    "heating_start_month": 10,
    "heating_end_month": 4,
    "created_at": datetime.utcnow().isoformat(sep=" "),
    "updated_at": datetime.utcnow().isoformat(sep=" "),
}

def _migration_applied(conn, name: str) -> bool:
    conn.execute(text(
        "CREATE TABLE IF NOT EXISTS schema_migrations "
        "(name VARCHAR(100) PRIMARY KEY, applied_at DATETIME NOT NULL)"
    ))
    row = conn.execute(text("SELECT 1 FROM schema_migrations WHERE name = :n"), {"n": name}).fetchone()
    return row is not None

def _mark_applied(conn, name: str):
    conn.execute(text(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (:n, :t)"
    ), {"n": name, "t": datetime.utcnow().isoformat(sep=" ")})

def _table_columns(conn, table: str):
    return [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()]

def _backup_database():
    if not os.path.exists(DB_FILE) or os.path.getsize(DB_FILE) == 0:
        return
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup = f"{DB_FILE}.bak.{stamp}"
    shutil.copy2(DB_FILE, backup)
    print(f"Migration: Datenbank gesichert unter {backup}")

def _rebuild_contracts(conn):
    """Remove the legacy UNIQUE(category) constraint while preserving all values."""
    if "contracts" not in [
        r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
    ]:
        return

    old_columns = _table_columns(conn, "contracts")
    has_unique_category = False
    for idx in conn.execute(text("PRAGMA index_list(contracts)")).fetchall():
        index_name = idx[1]
        is_unique = bool(idx[2])
        if not is_unique:
            continue
        indexed = [r[2] for r in conn.execute(text(f"PRAGMA index_info({index_name})")).fetchall()]
        if indexed == ["category"]:
            has_unique_category = True

    # Also recreate if columns are missing (older installations).
    needs_rebuild = has_unique_category or any(c not in old_columns for c in CONTRACT_COLUMNS)
    if not needs_rebuild:
        return

    price_rows = []
    if "contract_prices" in [
        r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
    ]:
        price_rows = [
            tuple(row) for row in conn.execute(text(
                "SELECT id, contract_id, valid_from, base_fee_monthly, unit_price, "
                "monthly_payment, created_at FROM contract_prices"
            )).fetchall()
        ]
        conn.execute(text("DROP TABLE contract_prices"))

    conn.execute(text("PRAGMA foreign_keys=OFF"))
    try:
        index_names = [
            row[1] for row in conn.execute(text("PRAGMA index_list(contracts)")).fetchall()
            if row[1] and not row[1].startswith("sqlite_autoindex_")
        ]
        conn.execute(text("ALTER TABLE contracts RENAME TO contracts_old"))
        for name in index_names:
            conn.execute(text(f"DROP INDEX IF EXISTS {name}"))
        Base.metadata.tables["contracts"].create(conn)

        available = [c for c in CONTRACT_COLUMNS if c in old_columns]
        cols_sql = ", ".join(available)
        select_parts = []
        for c in CONTRACT_COLUMNS:
            if c in available:
                select_parts.append(c)
            else:
                default = CONTRACT_DEFAULTS[c]
                select_parts.append(":default_" + c)
        params = {
            f"default_{c}": CONTRACT_DEFAULTS[c]
            for c in CONTRACT_COLUMNS if c not in available
        }
        conn.execute(text(
            f"INSERT INTO contracts ({cols_sql}) SELECT {', '.join(select_parts)} FROM contracts_old"
        ), params)
        conn.execute(text("DROP TABLE contracts_old"))
    finally:
        conn.execute(text("PRAGMA foreign_keys=ON"))

    _create_contract_prices_table(conn)
    _restore_price_rows(conn, price_rows)

def _add_reading_client_ref(conn):
    columns = _table_columns(conn, "readings")
    if "client_ref" not in columns:
        conn.execute(text("ALTER TABLE readings ADD COLUMN client_ref VARCHAR(100)"))
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_readings_client_ref ON readings(client_ref)"
    ))

def _create_contract_prices_table(conn):
    conn.execute(text(
        "CREATE TABLE IF NOT EXISTS contract_prices ("
        "id INTEGER PRIMARY KEY, "
        "contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE, "
        "valid_from DATE NOT NULL, "
        "base_fee_monthly FLOAT NOT NULL DEFAULT 0.0, "
        "unit_price FLOAT NOT NULL DEFAULT 0.0, "
        "monthly_payment FLOAT NOT NULL DEFAULT 0.0, "
        "created_at DATETIME NOT NULL, "
        "CONSTRAINT uq_contract_price_start UNIQUE (contract_id, valid_from))"
    ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_contract_prices_contract_id ON contract_prices(contract_id)"
    ))

def _restore_price_rows(conn, rows):
    if not rows:
        return
    valid_ids = {r[0] for r in conn.execute(text("SELECT id FROM contracts")).fetchall()}
    now = datetime.utcnow().isoformat(sep=" ")
    for row in rows:
        if row[1] not in valid_ids:
            continue
        conn.execute(text(
            "INSERT OR IGNORE INTO contract_prices "
            "(id, contract_id, valid_from, base_fee_monthly, unit_price, monthly_payment, created_at) "
            "VALUES (:id, :cid, :from, :base, :unit, :pay, :created)"
        ), {
            "id": row[0], "cid": row[1], "from": row[2], "base": row[3] or 0.0,
            "unit": row[4] or 0.0, "pay": row[5] or 0.0, "created": row[6] or now,
        })

def _seed_contract_prices(conn):
    """One initial price section per legacy contract, starting at its contract start."""
    _create_contract_prices_table(conn)
    conn.execute(text(
        "INSERT OR IGNORE INTO contract_prices "
        "(contract_id, valid_from, base_fee_monthly, unit_price, monthly_payment, created_at) "
        "SELECT id, start_date, base_fee_monthly, unit_price, monthly_payment, :now FROM contracts"
    ), {"now": datetime.utcnow().isoformat(sep=" ")})

def _repair_contract_prices_fk(conn):
    """Heal installations where the price table still references a removed table."""
    tables = {
        r[0] for r in conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )).fetchall()
    }
    if "contract_prices" not in tables:
        return
    fks = conn.execute(text("PRAGMA foreign_key_list(contract_prices)")).fetchall()
    if not any(fk[2] != "contracts" for fk in fks):
        return

    rows = [
        tuple(row) for row in conn.execute(text(
            "SELECT id, contract_id, valid_from, base_fee_monthly, unit_price, "
            "monthly_payment, created_at FROM contract_prices"
        )).fetchall()
    ]
    conn.execute(text("DROP TABLE contract_prices"))
    _create_contract_prices_table(conn)
    _restore_price_rows(conn, rows)

def run_migrations():
    """
    Controlled, idempotent SQLite migration. Backs up the database before the
    structural change and can safely be run more than once on the same or a copied DB.
    """
    with engine.connect() as conn:
        try:
            if not _migration_applied(conn, "contracts_v2"):
                has_data = False
                try:
                    has_data = conn.execute(text("SELECT COUNT(*) FROM contracts")).scalar() > 0
                except Exception:
                    has_data = False
                if has_data:
                    _backup_database()
                _rebuild_contracts(conn)
                _add_reading_client_ref(conn)
                _mark_applied(conn, "contracts_v2")

            _repair_contract_prices_fk(conn)
            _seed_contract_prices(conn)
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"Migration notice: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
