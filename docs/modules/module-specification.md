# 📦 Module Specification (ข้อกำหนดมาตรฐานของโมดูลใน Organella)

คู่มือฉบับนี้กำหนดมาตรฐานสำหรับนักพัฒนาโมดูล (ทั้ง First-party และ Community Modules) เพื่อให้สามารถเชื่อมต่อกับ Organella Platform ได้อย่างถูกต้อง

---

## 1. ภาพรวมโครงสร้างโมดูล (Module Directory Structure)

โมดูลมาตรฐานที่สมบูรณ์จะประกอบด้วยส่วนแสดงผล (Remote UI) และส่วนประมวลผล (Backend Plugin):

```text
modules/<module-id>/
├── module.json                       # ไฟล์ Manifest กำหนดคุณสมบัติ, สิทธิ์ และจุดเชื่อมต่อ (บังคับ)
├── README.md                         # คำอธิบายฟังก์ชันและวิธีใช้งานโมดูล
├── ui/                               # Remote Micro-Frontend (Vite + React)
│   ├── package.json
│   ├── vite.config.ts                # ตั้งค่า Vite Module Federation
│   └── src/
│       ├── ConsultationTab.tsx       # Component สำหรับเสียบเข้า Slot
│       └── DoctorQueueWidget.tsx     # Widget สำหรับเสียบเข้า Dashboard
└── api/                              # Backend Plugin (Python / FastAPI Router)
    ├── pyproject.toml
    └── plugin.py                     # Route handler, Event hooks และ DB migrations
```

---

## 2. ข้อกำหนดไฟล์ Manifest (`module.json`)

ทุกโมดูลจะต้องมีไฟล์ `module.json` วางไว้ที่รากของโมดูล:

```json
{
  "$schema": "https://raw.githubusercontent.com/organella-health/organella/main/docs/modules/module-manifest-schema.json",
  "id": "doctor-opd",
  "name": "Doctor OPD & Clinical Notes",
  "version": "1.0.0",
  "author": "Organella Community",
  "license": "AGPL-3.0",
  "description": "ระบบห้องตรวจแพทย์ บันทึก SOAP Note, วินิจฉัยโรค ICD-10 และสั่งการรักษา",
  "minCoreVersion": "1.0.0",
  "permissions": [
    "patient:read",
    "encounter:write",
    "condition:write",
    "medication:write"
  ],
  "frontend": {
    "entry": "http://localhost:5001/assets/remoteEntry.js",
    "slots": [
      {
        "slotId": "patient-workspace-tab",
        "title": "ห้องตรวจ (Doctor Note)",
        "component": "./ConsultationTab"
      },
      {
        "slotId": "dashboard-widget",
        "title": "รายชื่อรอตรวจของแพทย์",
        "component": "./DoctorQueueWidget"
      }
    ]
  },
  "backend": {
    "pluginPackage": "modules.doctor_opd",
    "apiPrefix": "/api/v1/modules/doctor-opd",
    "hooks": [
      "on_patient_admitted",
      "on_encounter_closed"
    ]
  }
}
```

---

## 3. กฎและข้อบังคับของโมดูล (Module Rules & Guidelines)

1. **Isolation:** โมดูลต้องไม่เปลี่ยนแปลง Core Database Tables โดยตรง หากต้องการจัดเก็บข้อมูลเฉพาะของโมดูล ให้สร้างตารางหรือ Schema แยก พร้อมระบุ Prefix ชัดเจน (เช่น `mod_opd_*`)
2. **Standard Compliance:** ข้อมูลทางการแพทย์ที่เกิดขึ้นในโมดูล ต้องมีฟังก์ชัน Mapping ข้อมูลกลับสู่มาตรฐาน **HL7 FHIR R4** ผ่าน `@organella/fhir-helpers` เสมอ
3. **Graceful Degradation:** หาก Backend ของโมดูลไม่พร้อมทำงาน ส่วน Frontend Remote ควรแสดง Fallback Error Message ที่ชัดเจน และไม่ทำให้ Host Shell ค้าง
