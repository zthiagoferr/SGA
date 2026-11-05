import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

database_url = os.getenv("DATABASE_URL")

if not database_url:
    raise RuntimeError("DATABASE_URL não configurada")

database_url = database_url.replace(
    "postgresql://",
    "postgresql+psycopg://",
    1
)

engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_recycle=300
)

def test_connection():
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT current_database()")
        ).scalar_one()
