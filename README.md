# 🧬 Organella

> **The Open-Source, Modular Healthcare Platform (Generic Health Engine)**  
> Built for agility, standards-compliance, and community innovation.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Standard: HL7 FHIR R4](https://img.shields.io/badge/Standard-HL7%20FHIR%20R4-orange.svg)](https://hl7.org/fhir/R4/)
[![Frontend: React + Vite](https://img.shields.io/badge/Frontend-React%20%7C%20Vite%20Federation-61dafb.svg)](https://vitejs.dev/)
[![Backend: FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python-009688.svg)](https://fastapi.tiangolo.com/)

---

## 🌟 Vision (วิสัยทัศน์)
**Organella** ได้รับแรงบันดาลใจจาก *Organelle (ออร์แกเนลล์)* ในทางชีววิทยา ซึ่งหมายถึงหน่วยทำงานอิสระภายในเซลล์สิ่งมีชีวิต เปรียบเสมือนระบบหลักของสถานพยาบาลที่เป็นตัวเซลล์ และโมดูลบริการต่างๆ (เช่น ห้องตรวจแพทย์ OPD, หอผู้ป่วยใน IPD, คลังยา, ระบบคิว, นัดหมาย) เป็นออร์แกเนลล์ที่สถานพยาบาลสามารถเลือกประกอบ ติดตั้ง และถอดถอนได้แบบ **App Store**

---

## 🏗️ Architecture Overview (ภาพรวมสถาปัตยกรรม)
- **Generic Health Engine:** แกนกลางอิสระ จัดการเฉพาะ Master Patient Index (MPI), ระบบสิทธิ์ (RBAC), ความปลอดภัย (Audit Log) และ Module Lifecycle Manager
- **Hybrid Data Model:** Relational Core (PostgreSQL) สำหรับธุรกรรมคลินิกความเร็วสูง พร้อม **HL7 FHIR R4 Adapter Layer** สำหรับการเชื่อมโยงข้อมูลสุขภาพมาตรฐานสากล
- **Micro-Frontend Module Store:** หน้าบ้านใช้ **Vite Module Federation** ในการโหลด Remote Modules มาเสียบใน UI Extension Slots (เช่น Patient Banner, Tabs, Dashboard Widgets)
- **FastAPI Plugin Architecture:** หลังบ้านมีระบบ Hook Dispatcher สำหรับ Event-driven Extensions

---

## 📁 Project Structure (โครงสร้างโปรเจกต์)
```text
Organella/
├── apps/
│   ├── host-shell/        # Frontend Shell (React + Vite Module Federation + Tailwind)
│   └── core-api/          # Backend Core Shell (FastAPI + SQLAlchemy + Pydantic v2)
├── modules/               # Independent Pluggable Modules
│   └── doctor-opd/        # Showcase Module: Doctor OPD & SOAP Clinical Notes
├── packages/
│   ├── organella-sdk/     # TypeScript Slot & Component Contract SDK
│   └── fhir-helpers/      # Utility สำหรับ FHIR R4 Resource Mapping
├── docs/                  # Architecture Design Records & Guides
├── docker-compose.yml     # Infrastructure (PostgreSQL 16 + Redis)
├── Master_plan.md         # Full Architectural Blueprint
└── README.md
```

---

## 🚦 Roadmap & Plane Tasks
การติดตามงานดำเนินการผ่านระบบ Plane PM (Prefix: `ORG`):
- [ ] `ORG-1`: Phase 0 - Repository Foundation & Monorepo Architecture Setup
- [ ] `ORG-2`: Phase 1 - Core Shell, Auth/RBAC & Master Patient Index (MPI)
- [ ] `ORG-3`: Phase 2 - Module Engine, Dynamic Micro-Frontend Loader & Slot Registry
- [ ] `ORG-4`: Phase 3 - Showcase Module: Doctor OPD Consultation & Clinical Notes
- [ ] `ORG-5`: Phase 4 - Developer SDK, Community RFC Templates & Open Source Launch

---

## 📄 License
This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.
