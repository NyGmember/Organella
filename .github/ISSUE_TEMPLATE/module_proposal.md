---
name: 🧩 New Clinical Module Proposal (เสนอสร้างโมดูลทางการแพทย์ใหม่)
about: เสนอแนวคิดหรือ RFC สำหรับสร้างโมดูลส่วนขยายใหม่ในระบบนิเวศ Organella
title: "[MODULE RFC] "
labels: enhancement, module-rfc
---

## 1. ชื่อโมดูลและรหัสโมดูล (Module Name & ID)
- **Module ID**: `@organella-module/...`
- **ชื่อโมดูล**: 

## 2. ปัญหาทางคลินิกที่ต้องการแก้ไข (Clinical Use Case)
อธิบายกระบวนการทำงานในโรงพยาบาลหรือคลินิกที่โมดูลนี้จะเข้ามาช่วย:

## 3. รายการสิทธิ์ที่โมดูลต้องใช้ (Required Role List)
ระบุรายการ Permission Scopes ที่จำเป็นต้องตรวจสอบด้วย `checkRequiredPermissions`:
- [ ] `patient:read`
- [ ] `encounter:read`
- [ ] อื่นๆ: `...`

## 4. มาตรฐานข้อมูลสุขภาพที่ใช้ (Health Data Standards)
- **HL7 FHIR R4 Resources**: (เช่น `Observation`, `DiagnosticReport`, `ServiceRequest`)
- **Terminology**: (เช่น `ICD-10`, `LOINC`, `SNOMED CT`, `TMT`)
