import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()  # reads backend/.env -- without this, DATABASE_URL always falls back to the localhost default below

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/dip_kerala")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
