# Master Plan: Organella (Open-Source Modular Healthcare Platform)

> **Project Name:** Organella  
> **GitHub Organization:** `organella-health`  
> **Plane Project Prefix:** `ORG`  
> **Target License:** GNU Affero General Public License v3.0 (AGPL-3.0)  
> **Core Architecture:** Generic Health Engine Shell + Micro-Frontend & Backend Plugins (Module Store)  
> **Interoperability Standard:** Hybrid Architecture (Relational Core + HL7 FHIR R4 Adapter Layer)  
> **Local Workspace:** `D:\SynologyDrive\Drive\Projects\Organella`

---

## 1. Executive Summary & Vision (วิสัยทัศน์ของโครงการ)

**Organella** มีเป้าหมายเพื่อสร้าง **ระบบสารสนเทศสุขภาพแบบโมดูลาร์ (Modular Health Platform) โอเพนซอร์ส** ที่ยืดหยุ่น ปรับขยายได้ไม่จำกัดขนาด และรองรับการเชื่อมต่อข้อมูลสุขภาพตามมาตรฐานสากล 

ชื่อ **Organella** ได้รับแรงบันดาลใจจาก *Organelle (ออร์แกเนลล์)* ในทางชีววิทยา ซึ่งหมายถึงหน่วยทำงานอิสระภายในเซลล์สิ่งมีชีวิต (เช่น ไมโทคอนเดรีย ไรโบโซม) ที่ทำหน้าที่เฉพาะทางอย่างสมบูรณ์แบบ เปรียบระบบหลักของสถานพยาบาลเหมือนตัวเซลล์ และโมดูลบริการต่างๆ (OPD, IPD, ห้องยา, คิว) เหมือนออร์แกเนลล์ที่ประกอบและเลือกติดตั้งได้ตามต้องการ

### หลักการออกแบบสำคัญ (Core Design Principles)
1. **Generic Health Engine (แกนกลางอิสระ):** ระบบหลัก (Core Shell) จะไม่ผูกมัดกับขนาดของสถานพยาบาล มีหน้าที่จัดการ Master Patient Index (MPI), ระบบสิทธิ์ (RBAC), ระบบความปลอดภัย/Audit Log และ **Module Management Engine (App Store)**
2. **App Store & Plugin Ecosystem:** ฟังก์ชันการทำงานทางการแพทย์ทุกส่วน (OPD, IPD, คลังยา, คิว, นัดหมาย) จะพัฒนาในลักษณะ **Module อิสระ** ที่สถานพยาบาลสามารถเลือกติดตั้ง/ถอดถอนได้ตามความเหมาะสม
3. **Standards-First & Interoperability:** ใช้โครงสร้างแบบ **Hybrid** โดยมี Relational Core สำหรับความเร็วและความแม่นยำในการทำงาน และมี **HL7 FHIR R4 Adapter** ในการส่งต่อ/แลกเปลี่ยนข้อมูลกับภายนอก
4. **Community-Driven & Content-Ready:** ออกแบบให้ง่ายต่อการมีส่วนร่วม (RFC Process, Developer SDK) พร้อมสื่อสารความคืบหน้าและนำเสนอความสามารถของแต่ละโมดูลผ่าน Social Media เพื่อสร้างเครือข่ายผู้ใช้งานและนักพัฒนา

---

## 2. System Architecture & High-Level Design (สถาปัตยกรรมระบบ)

```
+-----------------------------------------------------------------------------------+
|                           FRONTEND HOST APPLICATION (SHELL)                       |
|   (React + TypeScript + Vite Module Federation + Tailwind CSS + Shadcn UI)         |
|                                                                                   |
|  +-----------------+  +---------------------------------------------------------+  |
|  | Global Nav &    |  | UI Extension Slots (Dynamic Mount Points)               |  |
|  | Auth Context    |  |  [Slot: PatientBanner]  [Slot: DashboardWidget]         |  |
|  +-----------------+  |  [Slot: PatientTab]     [Slot: MainWorkspace]           |  |
|                       +---------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
                                          |
                        Module Federation (Dynamic Import)
                                          v
+-----------------------------------------------------------------------------------+
|                             COMMUNITY / CUSTOM MODULES                            |
|  +------------------------------+       +--------------------------------------+  |
|  | Module: Doctor OPD & Notes   |  ...  | Module: Smart Queue / Lab / Pharmacy |  |
|  | (UI Remote + Backend Plugin) |       | (UI Remote + Backend Plugin)         |  |
|  +------------------------------+       +--------------------------------------+  |
+-----------------------------------------------------------------------------------+
                                          |
                                    REST / WebSocket
                                          v
+-----------------------------------------------------------------------------------+
|                             BACKEND CORE SHELL (FastAPI)                          |
|                                                                                   |
|  +--------------------+  +----------------------+  +---------------------------+  |
|  | Auth & RBAC Engine |  | Master Patient Index |  | Module Lifecycle Manager  |  |
|  | (JWT / OAuth2/OIDC)|  | (PMI / Patient Demo) |  | (Catalog, Verify, Hooks)  |  |
|  +--------------------+  +----------------------+  +---------------------------+  |
|  +--------------------+  +----------------------+  +---------------------------+  |
|  | Audit Log & PDPA   |  | Event Bus (Pub/Sub)  |  | HL7 FHIR R4 Adapter Gateway| |
|  +--------------------+  +----------------------+  +---------------------------+  |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                                  DATA STORES                                      |
|    PostgreSQL (Relational Core Tables + JSONB Clinical Payloads + Audit Trail)    |
|    Redis (Session Cache, Module Event Bus, Async Queues)                         |
+-----------------------------------------------------------------------------------+
```

---

## 3. Technology Stack Specification (รายละเอียดชุดเทคโนโลยี)

### 3.1 Frontend (Core Shell & Module SDK)
- **Framework:** React 18+ / React 19 พร้อม TypeScript
- **Build System:** Vite พร้อม `@originjs/vite-plugin-federation`
- **State & Data Fetching:** TanStack Query (React Query) + Zustand
- **UI Components & Styling:** Tailwind CSS + Shadcn UI (Radix Primitives)
- **Icons:** Lucide React

### 3.2 Backend (Core Platform)
- **Language & Framework:** Python 3.11+ พร้อม **FastAPI**
- **Data Validation & Typing:** Pydantic v2 + `fhir.resources` (Official FHIR Pydantic models)
- **ORM & Migrations:** SQLAlchemy 2.0 (Async) + Alembic
- **Database:** PostgreSQL 16+ (JSONB Support)
- **Event Bus & Caching:** Redis 7+ (Pub/Sub สำหรับโมดูล และ Caching)

### 3.3 Medical Standards & Protocols
- **Interoperability:** HL7 FHIR Release 4 (R4) RESTful API endpoints
- **Terminology & Coding:**
  - **ICD-10 / ICD-11:** การวินิจฉัยโรค
  - **LOINC:** ผลการตรวจทางห้องปฏิบัติการ (Lab/Observation)
  - **SNOMED CT:** คำศัพท์ทางคลินิก (Clinical Terms)
- **Security & Privacy:** มาตรฐานการจัดเก็บข้อมูลตามแนวทาง PDPA และ HIPAA Audit Logging

---

## 4. Module System & App Store Specification (ข้อกำหนดระบบโมดูล)

### 4.1 Module Manifest (`module.json`)
```json
{
  "id": "doctor-opd-consultation",
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

## 5. First Reference Showcase Module: Doctor OPD & Clinical Notes
- **Patient Context Banner Integration:** ดึงข้อมูลผู้ป่วย (ชื่อ, อายุ, เพศ, สิทธิการรักษา, ประวัติแพ้ยา) มาแสดงอัตโนมัติ
- **SOAP Clinical Note Form:**
  - **S (Subjective):** อาการสำคัญ (Chief Complaint) และประวัติปัจจุบัน
  - **O (Objective):** ตรวจร่างกาย และสัญญาณชีพ (Vital Signs)
  - **A (Assessment):** การวินิจฉัยโรค พร้อมค้นหารหัส **ICD-10** อัตโนมัติ
  - **P (Plan):** สั่งการรักษาและสั่งยา
- **FHIR R4 Auto-Mapping:** แปลงข้อมูลอัตโนมัติเข้าสู่ `Encounter`, `Condition`, `MedicationRequest`

---

## 6. Social Media & Community Ideation Strategy
- **GitHub Discussions & RFC:** เทมเพลตเสนอและโหวตไอเดียโมดูลใหม่
- **Module Starter Kit:** `create-organella-module`
- **Social Media Content Themes:**
  1. *The Vision:* ทำไมระบบโรงพยาบาลควรเป็นเหมือน App Store? แนะนำ Organella
  2. *Standards Matter:* ส่องมาตรฐาน HL7 FHIR ในระบบ Organella
  3. *Build a Module:* สร้างโมดูลห้องตรวจแพทย์ใน 15 นาที
  4. *Community RFC:* โหวตโมดูลถัดไปที่คนอยากให้มีมากที่สุด

---

## 7. Project Implementation Roadmap & Plane Tasks
- `ORG-1` - Phase 0: Repository Foundation & Monorepo Architecture Setup
- `ORG-2` - Phase 1: Core Shell, Auth/RBAC & Master Patient Index (MPI)
- `ORG-3` - Phase 2: Module Engine, Dynamic Micro-Frontend Loader & Slot Registry
- `ORG-4` - Phase 3: Showcase Module - Doctor OPD Consultation & Clinical Notes
- `ORG-5` - Phase 4: Developer SDK, Community RFC Templates & Open Source Launch

---

## 8. Repository Directory Structure
```text
Organella/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── module-proposal.md        # เทมเพลตเสนอไอเดียโมดูล
│   └── workflows/
├── apps/
│   ├── host-shell/                   # Frontend Host App (React + Vite Module Federation)
│   └── core-api/                     # Backend Core Shell (FastAPI)
├── modules/                          # Reference & First-Party Modules
│   └── doctor-opd/                   # โมดูลสาธิตห้องตรวจแพทย์
├── packages/
│   ├── organella-sdk/                # Shared TypeScript Types & Slot Interfaces
│   └── fhir-helpers/                 # Utility สำหรับ Mapping ข้อมูลเข้า FHIR Resources
├── docs/                             # เอกสารสถาปัตยกรรมและคู่มือการพัฒนา
├── docker-compose.yml
├── LICENSE (AGPL-3.0)
├── Master_plan.md
└── README.md
```
