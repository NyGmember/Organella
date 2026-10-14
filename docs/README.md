# 📚 Organella Documentation Hub

ยินดีต้อนรับสู่ศูนย์รวมเอกสารและการออกแบบสถาปัตยกรรมของโครงการ **Organella**  
ระบบสารสนเทศสุขภาพแบบโมดูลาร์ (Open-Source Modular Healthcare Platform)

---

## 🧭 แผนผังเอกสาร (Documentation Directory)

เอกสารทั้งหมดถูกจัดหมวดหมู่ตามบริบทการใช้งานและกลุ่มผู้อ่าน เพื่อให้การค้นหาและพัฒนาต่อเป็นไปอย่างมีประสิทธิภาพ:

### 1. [Architecture (`docs/architecture/`)](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/architecture/)
เอกสารสถาปัตยกรรมและเทคนิคระดับแกนกลาง (Core System)
- [System Overview](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/architecture/system-overview.md): โครงสร้าง Generic Health Engine, Micro-Frontend Host Shell และ Event Bus
- [Security & Compliance](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/architecture/security-and-audit.md): การจัดการสิทธิ์ RBAC, Audit Logging (PDPA/HIPAA) และ Data Privacy
- [Architecture Decision Records (ADRs)](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/architecture/adr/):
  - [ADR-0000: Architecture Decision Record Template](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/architecture/adr/0000-template.md)
  - [ADR-0001: Monorepo Structure & Vite Module Federation](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/architecture/adr/0001-monorepo-and-module-federation.md)

### 2. [Module Development Guide (`docs/modules/`)](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/modules/)
คู่มือที่สำคัญที่สุดสำหรับการพัฒนาโมดูลใหม่เพื่อเสียบเข้ากับ Organella App Store
- [Module Specification](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/modules/module-specification.md): โครงสร้างและข้อกำหนดของ `module.json` manifest
- [Frontend Extension Slots Guide](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/modules/frontend-slots-guide.md): วิธีสร้าง Remote UI Component เพื่อเสียบเข้า UI Slots
- [Backend Hooks & Events Guide](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/modules/backend-hooks-guide.md): วิธีพัฒนา Backend Plugin และการดักฟัง Event Bus
- [Module Manifest JSON Schema](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/modules/module-manifest-schema.json): Schema สำหรับใช้ Validate ไฟล์ `module.json`
- [Module README Template](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/modules/templates/MODULE_README_TEMPLATE.md): แม่แบบเอกสารประจำแต่ละโมดูล

### 3. [Healthcare Standards (`docs/standards/`)](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/standards/)
มาตรฐานข้อมูลสารสนเทศสุขภาพสากล
- [HL7 FHIR R4 Mapping Guide](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/standards/fhir-r4-mapping-guide.md): กฎการแปลงข้อมูลคลินิกไปเป็น FHIR Resources
- [Medical Terminology & Coding](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/standards/terminology-codes.md): แนวทางการใช้รหัส ICD-10, LOINC, SNOMED CT

### 4. [Operations & Deployment (`docs/operations/`)](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/operations/)
คู่มือสำหรับ DevOps, System Admin และนักพัฒนาในการติดตั้งระบบ
- [Local Development Setup](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/operations/local-development.md): วิธีติดตั้งและเริ่มรันระบบในเครื่องนักพัฒนา
- [Deployment with Docker](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/operations/deployment-docker.md): การ Deploy ระบบด้วย Docker Compose

### 5. [Community RFCs (`docs/rfcs/`)](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/rfcs/)
กระบวนการเสนอไอเดียโมดูลใหม่และการมีส่วนร่วมของชุมชน
- [RFC Template](file:///d:/SynologyDrive/Drive/Projects/Organella/docs/rfcs/0000-rfc-template.md): แบบฟอร์มเสนอ Request for Comments (RFC)
