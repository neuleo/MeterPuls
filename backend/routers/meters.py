from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import Meter, Reading
from schemas import MeterCreate, MeterUpdate, MeterResponse

router = APIRouter(prefix="/meters", tags=["Meters"])

@router.get("", response_model=List[MeterResponse])
def get_all_meters(db: Session = Depends(get_db)):
    meters = db.query(Meter).order_by(Meter.category.asc(), Meter.name.asc()).all()
    result = []
    for m in meters:
        latest = db.query(Reading).filter(Reading.meter_id == m.id).order_by(Reading.reading_date.desc()).first()
        count = db.query(Reading).filter(Reading.meter_id == m.id).count()
        m_dict = {
            "id": m.id,
            "name": m.name,
            "category": m.category,
            "unit": m.unit,
            "meter_number": m.meter_number,
            "location": m.location,
            "created_at": m.created_at,
            "latest_reading": latest.reading_value if latest else None,
            "latest_reading_date": latest.reading_date if latest else None,
            "reading_count": count
        }
        result.append(MeterResponse(**m_dict))
    return result

@router.post("", response_model=MeterResponse, status_code=status.HTTP_201_CREATED)
def create_meter(meter_in: MeterCreate, db: Session = Depends(get_db)):
    new_meter = Meter(
        name=meter_in.name,
        category=meter_in.category,
        unit=meter_in.unit,
        meter_number=meter_in.meter_number,
        location=meter_in.location
    )
    db.add(new_meter)
    db.commit()
    db.refresh(new_meter)
    return MeterResponse(
        id=new_meter.id,
        name=new_meter.name,
        category=new_meter.category,
        unit=new_meter.unit,
        meter_number=new_meter.meter_number,
        location=new_meter.location,
        created_at=new_meter.created_at,
        latest_reading=None,
        latest_reading_date=None,
        reading_count=0
    )

@router.get("/{meter_id}", response_model=MeterResponse)
def get_meter(meter_id: int, db: Session = Depends(get_db)):
    meter = db.query(Meter).filter(Meter.id == meter_id).first()
    if not meter:
        raise HTTPException(status_code=404, detail="Zähler nicht gefunden")
    latest = db.query(Reading).filter(Reading.meter_id == meter.id).order_by(Reading.reading_date.desc()).first()
    count = db.query(Reading).filter(Reading.meter_id == meter.id).count()
    return MeterResponse(
        id=meter.id,
        name=meter.name,
        category=meter.category,
        unit=meter.unit,
        meter_number=meter.meter_number,
        location=meter.location,
        created_at=meter.created_at,
        latest_reading=latest.reading_value if latest else None,
        latest_reading_date=latest.reading_date if latest else None,
        reading_count=count
    )

@router.put("/{meter_id}", response_model=MeterResponse)
def update_meter(meter_id: int, meter_in: MeterUpdate, db: Session = Depends(get_db)):
    meter = db.query(Meter).filter(Meter.id == meter_id).first()
    if not meter:
        raise HTTPException(status_code=404, detail="Zähler nicht gefunden")
    if meter_in.name is not None:
        meter.name = meter_in.name
    if meter_in.unit is not None:
        meter.unit = meter_in.unit
    if meter_in.meter_number is not None:
        meter.meter_number = meter_in.meter_number
    if meter_in.location is not None:
        meter.location = meter_in.location
    db.commit()
    db.refresh(meter)
    latest = db.query(Reading).filter(Reading.meter_id == meter.id).order_by(Reading.reading_date.desc()).first()
    count = db.query(Reading).filter(Reading.meter_id == meter.id).count()
    return MeterResponse(
        id=meter.id,
        name=meter.name,
        category=meter.category,
        unit=meter.unit,
        meter_number=meter.meter_number,
        location=meter.location,
        created_at=meter.created_at,
        latest_reading=latest.reading_value if latest else None,
        latest_reading_date=latest.reading_date if latest else None,
        reading_count=count
    )

@router.delete("/{meter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meter(meter_id: int, db: Session = Depends(get_db)):
    meter = db.query(Meter).filter(Meter.id == meter_id).first()
    if not meter:
        raise HTTPException(status_code=404, detail="Zähler nicht gefunden")
    db.delete(meter)
    db.commit()
    return None
