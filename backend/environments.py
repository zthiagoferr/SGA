from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from database import engine

router = APIRouter(
    prefix="/api/environments",
    tags=["Ambientes"]
)

# Inicializa Firebase Admin
if not firebase_admin._apps:
    arquivo = Path("/etc/secrets/firebase-service-account.json")
    if not arquivo.exists():
        arquivo = Path(__file__).with_name(
            "firebase-service-account.json"
        )
    cred = credentials.Certificate(str(arquivo))
    firebase_admin.initialize_app(cred)


class EnvironmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    location: str | None = Field(default=None, max_length=150)
    capacity: int | None = Field(default=None, gt=0)


def current_user(
    authorization: str | None = Header(default=None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token Firebase obrigatório"
        )

    token = authorization.split(" ", 1)[1].strip()

    try:
        return auth.verify_id_token(token, check_revoked=True)
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Token inválido ou expirado"
        )


def require_coordinator(user=Depends(current_user)):
    with engine.connect() as conn:
        role = conn.execute(
            text("""
                SELECT role
                FROM users
                WHERE firebase_uid = :uid
            """),
            {"uid": user["uid"]}
        ).scalar_one_or_none()

    if role not in ("admin", "coordinator"):
        raise HTTPException(
            status_code=403,
            detail="Permissão de coordenador necessária"
        )

    return user


@router.get("")
def list_environments(user=Depends(current_user)):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, name, location, capacity, status
                FROM environments
                ORDER BY name ASC
            """)
        ).mappings().all()

    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create_environment(
    data: EnvironmentCreate,
    user=Depends(require_coordinator)
):
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                INSERT INTO environments
                    (name, location, capacity)
                VALUES
                    (:name, :location, :capacity)
                RETURNING
                    id, name, location, capacity, status
            """),
            data.model_dump()
        ).mappings().one()

    return dict(row)


@router.put("/{environment_id}")
def update_environment(
    environment_id: int,
    data: EnvironmentCreate,
    user=Depends(require_coordinator)
):
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                UPDATE environments
                SET name = :name,
                    location = :location,
                    capacity = :capacity
                WHERE id = :id
                RETURNING id, name, location, capacity, status
            """),
            {**data.model_dump(), "id": environment_id}
        ).mappings().one_or_none()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Ambiente não encontrado"
        )

    return dict(row)


@router.delete("/{environment_id}", status_code=204)
def delete_environment(
    environment_id: int,
    user=Depends(require_coordinator)
):
    from sqlalchemy.exc import IntegrityError

    try:
        with engine.begin() as conn:
            row = conn.execute(
                text("""
                    DELETE FROM environments
                    WHERE id = :id
                    RETURNING id
                """),
                {"id": environment_id}
            ).first()

            if row is None:
                raise HTTPException(
                    status_code=404,
                    detail="Ambiente não encontrado"
                )

    except IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Este ambiente possui registros vinculados e não pode ser excluído"
        )

    return None
