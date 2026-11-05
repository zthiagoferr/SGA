from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from database import engine
from environments import current_user, require_coordinator

router = APIRouter(prefix="/api/reservations", tags=["Reservas"])


class ReservationCreate(BaseModel):
    environment_id: int = Field(gt=0)
    person_id: int = Field(gt=0)
    title: str = Field(min_length=2, max_length=150)
    starts_at: datetime
    ends_at: datetime


@router.get("")
def list_reservations(user=Depends(current_user)):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                r.id,
                r.environment_id,
                e.name AS environment_name,
                r.person_id,
                p.full_name AS person_name,
                r.created_by,
                r.title,
                r.starts_at,
                r.ends_at
            FROM reservations r
            JOIN environments e ON e.id = r.environment_id
            LEFT JOIN people p ON p.id = r.person_id
            ORDER BY r.starts_at ASC
        """)).mappings().all()

    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create_reservation(
    data: ReservationCreate,
    user=Depends(require_coordinator)
):
    if (
        data.starts_at.utcoffset() is None
        or data.ends_at.utcoffset() is None
    ):
        raise HTTPException(
            422, "Informe datas com fuso horário"
        )

    if data.starts_at >= data.ends_at:
        raise HTTPException(
            422, "O fim deve ser depois do início"
        )

    title = data.title.strip()
    if len(title) < 2:
        raise HTTPException(422, "Informe o título")

    try:
        with engine.begin() as conn:
            # Serializa criações feitas por esta API
            # para evitar conflitos simultâneos.
            conn.execute(text(
                "SELECT pg_advisory_xact_lock(740125, 1)"
            ))

            creator_id = conn.execute(text("""
                SELECT id FROM users
                WHERE firebase_uid = :uid
            """), {"uid": user["uid"]}).scalar_one_or_none()

            if creator_id is None:
                raise HTTPException(
                    403, "Usuário não cadastrado"
                )

            environment = conn.execute(text("""
                SELECT id FROM environments
                WHERE id = :id AND status = 'available'
            """), {"id": data.environment_id}).first()

            if environment is None:
                raise HTTPException(
                    422, "Ambiente inexistente ou indisponível"
                )

            person = conn.execute(text("""
                SELECT id FROM people WHERE id = :id
            """), {"id": data.person_id}).first()

            if person is None:
                raise HTTPException(
                    422, "Pessoa responsável não encontrada"
                )

            conflict = conn.execute(text("""
                SELECT id
                FROM reservations
                WHERE (
                    environment_id = :environment_id
                    OR person_id = :person_id
                )
                AND starts_at < :ends_at
                AND ends_at > :starts_at
                LIMIT 1
            """), {
                "environment_id": data.environment_id,
                "person_id": data.person_id,
                "starts_at": data.starts_at,
                "ends_at": data.ends_at
            }).first()

            if conflict:
                raise HTTPException(
                    409,
                    "Conflito de horário: ambiente ou responsável ocupado"
                )

            row = conn.execute(text("""
                INSERT INTO reservations (
                    environment_id,
                    person_id,
                    created_by,
                    title,
                    starts_at,
                    ends_at
                )
                VALUES (
                    :environment_id,
                    :person_id,
                    :created_by,
                    :title,
                    :starts_at,
                    :ends_at
                )
                RETURNING
                    id, environment_id, person_id,
                    created_by, title, starts_at, ends_at
            """), {
                "environment_id": data.environment_id,
                "person_id": data.person_id,
                "created_by": creator_id,
                "title": title,
                "starts_at": data.starts_at,
                "ends_at": data.ends_at
            }).mappings().one()

        return dict(row)

    except IntegrityError:
        raise HTTPException(
            409, "Não foi possível salvar a reserva"
        )


@router.delete("/{reservation_id}", status_code=204)
def delete_reservation(
    reservation_id: int,
    user=Depends(require_coordinator)
):
    with engine.begin() as conn:
        row = conn.execute(text("""
            DELETE FROM reservations
            WHERE id = :id
            RETURNING id
        """), {"id": reservation_id}).first()

        if row is None:
            raise HTTPException(
                404, "Reserva não encontrada"
            )

    return None
