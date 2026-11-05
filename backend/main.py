from fastapi.middleware.cors import CORSMiddleware

from fastapi import FastAPI, Depends
from reservations import router as reservations_router
from sqlalchemy import text

from database import test_connection, engine
from people import router as people_router

from environments import (
    router as environments_router,
    current_user
)

app = FastAPI(
    title="SGA API",
    description="API do Sistema de Gestão de Ambiente",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:4200",
        "http://localhost:4200",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


app.include_router(environments_router)
app.include_router(people_router)
app.include_router(reservations_router)


@app.get("/")
def home():
    return {"message": "SGA API online"}


@app.get("/health")
def health():
    return {
        "status": "online",
        "database": test_connection()
    }


@app.get("/api/me", tags=["Autenticação"])
def get_my_profile(user=Depends(current_user)):
    with engine.connect() as conn:
        profile = conn.execute(
            text("""
                SELECT id, full_name, role
                FROM users
                WHERE firebase_uid = :uid
            """),
            {"uid": user["uid"]}
        ).mappings().first()

    if not profile:
        return {
            "authenticated": True,
            "registered": False,
            "role": None
        }

    return {
        "authenticated": True,
        "registered": True,
        "profile": dict(profile)
    }
