
import os
from io import BytesIO

import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import text

from database import engine
from environments import require_coordinator

router = APIRouter(prefix="/api/people", tags=["Fotos de Pessoas"])

MAX_SIZE = 2 * 1024 * 1024
FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


@router.post("/{person_id}/photo")
def upload_person_photo(
    person_id: int,
    file: UploadFile = File(...),
    user=Depends(require_coordinator)
):
    if person_id < 1:
        raise HTTPException(422, "ID inválido")

    if file.content_type not in FORMATS.values():
        raise HTTPException(415, "Use JPG, PNG ou WebP")

    content = file.file.read(MAX_SIZE + 1)

    if not content or len(content) > MAX_SIZE:
        raise HTTPException(413, "A foto deve ter no máximo 2 MB")

    try:
        with Image.open(BytesIO(content)) as img:
            fmt = img.format
            if fmt not in FORMATS:
                raise HTTPException(415, "Formato não permitido")
            if FORMATS[fmt] != file.content_type:
                raise HTTPException(415, "Formato do arquivo inconsistente")
            if img.width * img.height > 16000000:
                raise HTTPException(413, "Resolução muito alta")
            img.verify()
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(422, "Imagem inválida")

    with engine.connect() as conn:
        existe = conn.execute(
            text("SELECT id FROM people WHERE id = :id"),
            {"id": person_id}
        ).first()

    if not existe:
        raise HTTPException(404, "Pessoa não encontrada")

    nomes = (
        os.getenv("CLOUDINARY_CLOUD_NAME"),
        os.getenv("CLOUDINARY_API_KEY"),
        os.getenv("CLOUDINARY_API_SECRET")
    )

    if not all(nomes):
        raise HTTPException(503, "Cloudinary não configurado")

    cloudinary.config(
        cloud_name=nomes[0],
        api_key=nomes[1],
        api_secret=nomes[2],
        secure=True
    )

    imagem = BytesIO(content)
    imagem.name = "foto." + {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[fmt]

    try:
        result = cloudinary.uploader.upload(
            imagem,
            folder="sga/people",
            resource_type="image",
            allowed_formats=["jpg", "jpeg", "png", "webp"]
        )
        url = result["secure_url"]
    except Exception:
        raise HTTPException(502, "Falha ao enviar foto ao Cloudinary")

    with engine.begin() as conn:
        row = conn.execute(text("""
            UPDATE people
            SET photo_url = :url
            WHERE id = :id
            RETURNING id, photo_url
        """), {"url": url, "id": person_id}).mappings().first()

    if row is None:
        raise HTTPException(404, "Pessoa não encontrada")

    return dict(row)
