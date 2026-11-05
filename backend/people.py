from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from database import engine
from environments import current_user, require_coordinator

router = APIRouter(prefix="/api/people", tags=["Pessoas"])


class PersonData(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    role: str = Field(min_length=2, max_length=150)
    email: str = Field(min_length=3, max_length=254)


def validate_person(data: PersonData):
    name = data.name.strip()
    role = data.role.strip()
    email = data.email.strip()

    if len(name) < 2 or len(role) < 2 or "@" not in email:
        raise HTTPException(
            status_code=422,
            detail="Informe nome, função e e-mail válidos"
        )

    return {
        "full_name": name,
        "role_description": role,
        "email": email
    }


@router.get("")
def list_people(user=Depends(current_user)):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, full_name, role_description, email, photo_url
            FROM people
            ORDER BY full_name
        """)).mappings().all()

    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create_person(data: PersonData, user=Depends(require_coordinator)):
    values = validate_person(data)

    with engine.begin() as conn:
        row = conn.execute(text("""
            INSERT INTO people (full_name, role_description, email)
            VALUES (:full_name, :role_description, :email)
            RETURNING id, full_name, role_description, email, photo_url
        """), values).mappings().one()

    return dict(row)


@router.put("/{person_id}")
def update_person(
    person_id: int,
    data: PersonData,
    user=Depends(require_coordinator)
):
    values = validate_person(data)
    values["id"] = person_id

    with engine.begin() as conn:
        row = conn.execute(text("""
            UPDATE people
            SET full_name = :full_name,
                role_description = :role_description,
                email = :email
            WHERE id = :id
            RETURNING id, full_name, role_description, email, photo_url
        """), values).mappings().one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada")

    return dict(row)


@router.delete("/{person_id}", status_code=204)
def delete_person(
    person_id: int,
    user=Depends(require_coordinator)
):
    try:
        with engine.begin() as conn:
            row = conn.execute(text("""
                DELETE FROM people WHERE id = :id RETURNING id
            """), {"id": person_id}).first()

            if row is None:
                raise HTTPException(
                    status_code=404,
                    detail="Pessoa não encontrada"
                )

    except IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Esta pessoa possui registros vinculados"
        )

    return None
