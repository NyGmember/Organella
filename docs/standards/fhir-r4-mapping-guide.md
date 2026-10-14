# 🌐 HL7 FHIR R4 Mapping Guide

Organella ใช้สถาปัตยกรรมแบบ **Hybrid Architecture**: ข้อมูลภายในระบบจะจัดเก็บในฐานข้อมูลเชิงสัมพันธ์ (Relational Tables) เพื่อความรวดเร็วและประสิทธิภาพสูงในการประมวลผล แต่ทุกโมดูลจะต้องมีตัวแปลงข้อมูล (Mapping Adapter) เพื่อส่งออกข้อมูลในรูปแบบมาตรฐาน **HL7 FHIR R4** ผ่าน RESTful API

---

## 1. Core Resources Mapping

### 1.1 `Patient` Resource
เชื่อมโยงจาก Master Patient Index (MPI):
- `identifier`:
  - `system: "https://organella.health/identifier/hn"` (เลขประจำตัวโรงพยาบาล - HN)
  - `system: "https://organella.health/identifier/citizen-id"` (เลขบัตรประชาชน 13 หลัก)
- `name`: Family (นามสกุล), Given (ชื่อต้น)
- `gender`: `male` | `female` | `other` | `unknown`
- `birthDate`: วันเดือนปีเกิด (YYYY-MM-DD)

### 1.2 `Encounter` Resource
เชื่อมโยงจากการเปิดตรวจ/เข้ารับบริการ (Visit):
- `status`: `in-progress` | `finished`
- `class`: `AMB` (Ambulatory / ผู้ป่วยนอก OPD) หรือ `IMP` (Inpatient / ผู้ป่วยใน IPD)
- `subject`: Reference ไปยัง `Patient/<id>`
- `period`: วันที่และเวลาที่เริ่มตรวจจนถึงสิ้นสุด

### 1.3 `Condition` Resource
เชื่อมโยงจากการวินิจฉัยโรค (SOAP Assessment):
- `clinicalStatus`: `active` | `resolved`
- `verificationStatus`: `confirmed` | `provisional`
- `code`:
  - `coding`:
    - `system: "http://hl7.org/fhir/sid/icd-10"`
    - `code: "J00"`
    - `display: "Acute nasopharyngitis [common cold]"`

### 1.4 `MedicationRequest` Resource
เชื่อมโยงจากรายการสั่งยาของแพทย์:
- `status`: `active` | `completed`
- `intent`: `order`
- `medicationCodeableConcept`: ชื่อยาและรหัสยามาตรฐาน
- `dosageInstruction`: วิธีใช้ยา ปริมาณ และความถี่
