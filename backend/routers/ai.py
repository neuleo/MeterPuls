import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from database import get_db, DATABASE_DIR
from models import AISetting
from schemas import AISettingUpdate, AISettingResponse, AIModelItem, AIScanResult, AIContractScanResult
from ai_service import fetch_available_models, scan_meter_image, scan_contract_images

router = APIRouter(prefix="/ai", tags=["AI"])

UPLOADS_DIR = os.path.join(DATABASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

def get_or_create_ai_setting(db: Session) -> AISetting:
    setting = db.query(AISetting).first()
    if not setting:
        setting = AISetting(
            base_url="https://openrouter.ai/api",
            api_key="",
            selected_model="openai/gpt-4o-mini"
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting

@router.get("/settings", response_model=AISettingResponse)
def get_settings(db: Session = Depends(get_db)):
    setting = get_or_create_ai_setting(db)
    return AISettingResponse(
        id=setting.id,
        base_url=setting.base_url,
        api_key=setting.api_key,
        selected_model=setting.selected_model,
        updated_at=setting.updated_at,
        is_key_set=bool(setting.api_key and setting.api_key.strip())
    )

@router.post("/settings", response_model=AISettingResponse)
def update_settings(setting_in: AISettingUpdate, db: Session = Depends(get_db)):
    setting = get_or_create_ai_setting(db)
    setting.base_url = setting_in.base_url.strip()
    setting.api_key = setting_in.api_key.strip()
    setting.selected_model = setting_in.selected_model.strip()
    db.commit()
    db.refresh(setting)
    return AISettingResponse(
        id=setting.id,
        base_url=setting.base_url,
        api_key=setting.api_key,
        selected_model=setting.selected_model,
        updated_at=setting.updated_at,
        is_key_set=bool(setting.api_key and setting.api_key.strip())
    )

@router.get("/models", response_model=List[AIModelItem])
async def get_models(db: Session = Depends(get_db)):
    setting = get_or_create_ai_setting(db)
    try:
        models = await fetch_available_models(setting.base_url, setting.api_key)
        return models
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Fehler beim Abrufen der Modelle: {str(e)}"
        )

@router.post("/scan", response_model=AIScanResult)
async def scan_meter(
    file: UploadFile = File(...),
    model_override: str = Form(None),
    db: Session = Depends(get_db)
):
    setting = get_or_create_ai_setting(db)
    model = model_override or setting.selected_model
    if not model or not model.strip():
        raise HTTPException(
            status_code=400,
            detail="Kein AI Vision-Modell ausgewählt. Bitte wählen Sie ein Modell in den Einstellungen."
        )

    # Validate image content
    contents = await file.read()
    if not contents or len(contents) == 0:
        raise HTTPException(status_code=400, detail="Hochgeladene Bilddatei ist leer.")

    mime_type = file.content_type or "image/jpeg"
    if not mime_type.startswith("image/"):
        mime_type = "image/jpeg"

    # Also persist image temporarily into uploads folder
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    unique_name = f"scan_{uuid.uuid4().hex}{ext}"
    target_path = os.path.join(UPLOADS_DIR, unique_name)
    try:
        with open(target_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        pass

    try:
        scan_result = await scan_meter_image(
            image_bytes=contents,
            mime_type=mime_type,
            base_url=setting.base_url,
            api_key=setting.api_key,
            model=model
        )
        return scan_result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Vision-Erkennung fehlgeschlagen: {str(e)}"
        )

@router.post("/scan-contract", response_model=AIContractScanResult)
async def scan_contract(
    files: List[UploadFile] = File(...),
    model_override: str = Form(None),
    db: Session = Depends(get_db)
):
    setting = get_or_create_ai_setting(db)
    model = model_override or setting.selected_model
    if not model or not model.strip():
        raise HTTPException(
            status_code=400,
            detail="Kein AI Vision-Modell ausgewählt. Bitte wählen Sie ein Modell in den Einstellungen."
        )

    if not files:
        raise HTTPException(status_code=400, detail="Keine Screenshots hochgeladen.")

    images_payload = []
    for file in files:
        contents = await file.read()
        if not contents or len(contents) == 0:
            continue
        mime_type = file.content_type or "image/jpeg"
        if not mime_type.startswith("image/"):
            mime_type = "image/jpeg"
        images_payload.append((contents, mime_type))

    if not images_payload:
        raise HTTPException(status_code=400, detail="Alle hochgeladenen Bilddateien waren leer.")

    try:
        scan_result = await scan_contract_images(
            images=images_payload,
            base_url=setting.base_url,
            api_key=setting.api_key,
            model=model
        )
        return scan_result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Tarif-Erkennung fehlgeschlagen: {str(e)}"
        )

