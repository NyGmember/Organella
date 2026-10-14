# Contributing to Organella 🧬

ขอขอบคุณที่ให้ความสนใจร่วมพัฒนา **Organella**! ทุกการมีส่วนร่วมไม่ว่าจะเป็นการแจ้งปัญหา (Bug Report), การเสนอไอเดียโมดูลใหม่ (RFC), หรือการพัฒนาโค้ด (Pull Request) มีคุณค่าอย่างยิ่งต่อระบบสุขภาพโอเพนซอร์ส

---

## 1. แนวทางการพัฒนาโค้ด (Development Guidelines)

1. **Modular-First:** หากเป็นฟังก์ชันการทำงานเฉพาะทางคลินิก (เช่น OPD, คลังยา, นัดหมาย) ควรพัฒนาในลักษณะ **Module** ในโฟลเดอร์ `modules/` ไม่ควรใส่เข้าใน Core Shell โดยไม่จำเป็น
2. **Medical Standards:** ข้อมูลทางคลินิกต้องคำนึงถึงการแมปเข้าสู่มาตรฐาน **HL7 FHIR R4** และใช้รหัสมาตรฐานสากล (ICD-10, LOINC) เสมอ
3. **Audit & Privacy:** ต้องคำนึงถึงความปลอดภัยของข้อมูลผู้ป่วย (PDPA / HIPAA) ไม่ Hardcode ข้อมูลระบุตัวตน (PII/PHI) ในการทดสอบ

---

## 2. ขั้นตอนการส่งโค้ด (Pull Request Workflow)

1. **Fork** และ Clone Repository ไปยังเครื่องของคุณ
2. สร้าง Branch จาก `main`:
   ```bash
   git checkout -b feature/ORG-XX-short-description
   ```
3. ติดตั้ง Dependencies และทดสอบการทำงานใน Local
4. รันคำสั่งตรวจสอบ Lint & Typecheck:
   ```bash
   pnpm lint
   pnpm typecheck
   ```
5. Commit โค้ดตามมาตรฐาน [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(opd): add SOAP note assessment tab`
   - `fix(auth): resolve token refresh race condition`
   - `docs(modules): update slot props definition`
6. เปิด **Pull Request (PR)** ไปยังสาขา `main` พร้อมระบุรายละเอียดการเปลี่ยนแปลงและรหัสงานใน Plane (เช่น `ORG-1`)
