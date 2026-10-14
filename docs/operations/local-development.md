# 💻 Local Development Setup Guide

คู่มือสำหรับการติดตั้งและรันสภาพแวดล้อมการพัฒนา Organella บนเครื่องคอมพิวเตอร์ของคุณ

---

## 1. สิ่งที่ต้องติดตั้งล่วงหน้า (Prerequisites)
- **Node.js:** v20+ หรือ v24+ (พร้อม `pnpm` v9+)
- **Python:** v3.11+ หรือ v3.12+ (แนะนำใช้ `uv` สำหรับจัดการ package อย่างรวดเร็ว)
- **Docker & Docker Compose:** สำหรับรัน PostgreSQL 16 และ Redis 7
- **Git**

---

## 2. ขั้นตอนการติดตั้ง (Step-by-Step Setup)

### 2.1 Clone Repository & สร้าง Environment File
```bash
git clone https://github.com/organella-health/organella.git
cd Organella
cp .env.example .env
```

### 2.2 สั่งรัน Database & Caching Services ผ่าน Docker
```bash
docker compose up -d
```
ตรวจสอบว่า container รันสำเร็จ:
```bash
docker compose ps
```

### 2.3 ติดตั้ง Frontend Dependencies (Monorepo)
```bash
pnpm install
```

### 2.4 ติดตั้ง Backend Core Dependencies
```bash
cd apps/core-api
uv venv
# สำหรับ Windows (PowerShell)
.venv\Scripts\activate
uv sync
```

---

## 3. การรันระบบเพื่อทดสอบ (Running the Dev Servers)

### รัน Frontend Shell (พอร์ต 3000)
```bash
pnpm --filter @organella/host-shell dev
```

### รัน Showcase Module UI (พอร์ต 5001)
```bash
pnpm --filter @organella-module/doctor-opd dev
```

### รัน Backend Core API (พอร์ต 8000)
```bash
cd apps/core-api
uv run uvicorn organella_core.main:app --reload --port 8000
```
เปิดดู Interactive API Docs ได้ที่ `http://localhost:8000/docs`
