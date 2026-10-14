# 🔌 Backend Hooks & Event Bus Guide

Backend Core API ของ Organella มีระบบ **Lifecycle Manager & Event Bus** สำหรับให้โมดูลสามารถลงทะเบียน API Endpoints และดักฟังเหตุการณ์สำคัญ (Events) ภายในโรงพยาบาล

---

## 1. การลงทะเบียน Backend Plugin Router

โมดูลสามารถเตรียม FastAPI `APIRouter` และนำมาเชื่อมต่อเข้าสู่ระบบหลักได้โดยอัตโนมัติตาม `apiPrefix` ที่ระบุใน `module.json`:

```python
# modules/doctor_opd/api/router.py
from fastapi import APIRouter, Depends
from organella_core.security import require_permission, CurrentUser

router = APIRouter()

@router.post("/consultations", dependencies=[Depends(require_permission("encounter:write"))])
async def create_consultation(payload: dict, current_user: CurrentUser):
    # บันทึกข้อมูลการตรวจ
    return {"status": "success", "consultation_id": "c-1002"}
```

---

## 2. การดักฟัง Event Bus Hooks (Pub/Sub)

เมื่อเกิดกิจกรรมสำคัญในระบบ Core Shell จะยิง Event ผ่าน Redis Event Bus:

| Event Hook Name | จังหวะการเกิด Event | Payload ตัวอย่าง |
| :--- | :--- | :--- |
| `on_patient_registered` | ผู้ป่วยใหม่ลงทะเบียนเข้าสู่ระบบ | `{ "patient_id": "pat-1", "hn": "670001" }` |
| `on_patient_admitted` | ผู้ป่วยมาถึงแผนก / เปิด Visit | `{ "patient_id": "pat-1", "encounter_id": "enc-9" }` |
| `on_encounter_closed` | แพทย์ปิดเคสการตรวจ | `{ "encounter_id": "enc-9", "doctor_id": "dr-1" }` |
| `on_prescription_ordered` | มีการยืนยันรายการสั่งยา | `{ "encounter_id": "enc-9", "order_id": "rx-55" }` |

### ตัวอย่างการเขียน Hook Handler:
```python
# modules/doctor_opd/api/hooks.py
async def on_patient_admitted(payload: dict):
    patient_id = payload.get("patient_id")
    encounter_id = payload.get("encounter_id")
    print(f"[Doctor OPD] เตรียมแฟ้มประวัติสำหรับตรวจผู้ป่วย: {patient_id}")
```
