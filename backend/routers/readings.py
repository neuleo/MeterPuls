import os
import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from database import get_db, DATABASE_DIR
from models import Meter, Reading
from schemas import ReadingCreate, ReadingUpdate, ReadingResponse

router = APIRouter(prefix="/readings", tags=["Readings"])

UPLOADS_DIR = os.path.join(DATABASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

@router.get("", response_model=List[ReadingResponse])
def get_readings(
    meter_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    query = db.query(Reading)
    if meter_id is not None:
        query = query.filter(Reading.meter_id == meter_id)
    readings = query.order_by(Reading.reading_date.desc()).limit(limit).all()
    return readings

@router.post("", response_model=ReadingResponse, status_code=status.HTTP_201_CREATED)
def create_reading(reading_in: ReadingCreate, db: Session = Depends(get_db)):
    meter = db.query(Meter).filter(Meter.id == reading_in.meter_id).first()
    if not meter:
        raise HTTPException(status_code=404, detail="Zähler nicht gefunden")

    new_reading = Reading(
        meter_id=reading_in.meter_id,
        reading_value=reading_in.reading_value,
        reading_date=reading_in.reading_date,
        image_path=reading_in.image_path,
        notes=reading_in.notes
    )
    db.add(new_reading)
    db.commit()
    db.refresh(new_reading)
    return new_reading

@router.post("/upload-and-create", response_model=ReadingResponse, status_code=status.HTTP_201_CREATED)
async def create_reading_with_image(
    meter_id: int = Form(...),
    reading_value: float = Form(...),
    reading_date: datetime = Form(...),
    notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    meter = db.query(Meter).filter(Meter.id == meter_id).first()
    if not meter:
        raise HTTPException(status_code=404, detail="Zähler nicht gefunden")

    saved_filename = None
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1].lower() or ".jpg"
        unique_name = f"{uuid.uuid4().hex}{ext}"
        target_path = os.path.join(UPLOADS_DIR, unique_name)
        contents = await file.read()
        with open(target_path, "wb") as f:
            f.write(contents)
        saved_filename = f"/uploads/{unique_name}"

    new_reading = Reading(
        meter_id=meter_id,
        reading_value=reading_value,
        reading_date=reading_date,
        image_path=saved_filename,
        notes=notes
    )
    db.add(new_reading)
    db.commit()
    db.refresh(new_reading)
    return new_reading

@router.get("/{reading_id}", response_model=ReadingResponse)
def get_reading(reading_id: int, db: Session = Depends(get_db)):
    reading = db.query(Reading).filter(Reading.id == reading_id).first()
    if not reading:
        raise HTTPException(status_code=404, detail="Ablesung nicht gefunden")
    return reading

@router.put("/{reading_id}", response_model=ReadingResponse)
def update_reading(reading_id: int, reading_in: ReadingUpdate, db: Session = Depends(get_db)):
    reading = db.query(Reading).filter(Reading.id == reading_id).first()
    if not reading:
        raise HTTPException(status_code=404, detail="Ablesung nicht gefunden")

    if reading_in.reading_value is not None:
        reading.reading_value = reading_in.reading_value
    if reading_in.reading_date is not None:
        reading.reading_date = reading_in.reading_date
    if reading_in.notes is not None:
        reading.notes = reading_in.notes

    db.commit()
    db.refresh(reading)
    return reading

@router.delete("/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reading(reading_id: int, db: Session = Depends(get_db)):
    reading = db.query(Reading).filter(Reading.id == reading_id).first()
    if not reading:
        raise HTTPException(status_code=404, detail="Ablesung nicht gefunden")

    # Clean up file if present
    if reading.image_path and reading.image_path.startswith("/uploads/"):
        fname = os.path.basename(reading.image_path)
        fpath = os.path.join(UPLOADS_DIR, fname)
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
            except OSError:
                pass

    db.delete(reading)
    db.commit()
    return None
