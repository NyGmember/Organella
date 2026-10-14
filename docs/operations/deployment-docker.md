# 🐳 Deployment with Docker Guide

คู่มือสำหรับการ Deploy ระบบ Organella และการจัดการ Production Containers

---

## 1. โครงสร้างบริการใน Container (Service Architecture)

Organella แบ่งการทำงานออกเป็น Service ย่อยดังนี้:
1. **`postgres`:** PostgreSQL 16 Alpine สำหรับจัดเก็บ Core Data, Module Tables และ Audit Trails
2. **`redis`:** Redis 7 Alpine สำหรับทำ In-memory Cache และ Event Bus Pub/Sub
3. **`core-api`:** FastAPI backend application container
4. **`host-shell`:** Nginx web server ให้บริการ static build ของ React Host Shell
5. **`modules-*`:** Containers สำหรับโมดูลเสริมต่างๆ (หรือโฮสต์ผ่าน CDN/Object Storage)

---

## 2. การตั้งค่าความปลอดภัยสำหรับ Production (Security Checklist)
- [ ] เปลี่ยนรหัสผ่าน `POSTGRES_PASSWORD` ใน `.env` เป็น Random Strong Password
- [ ] ตั้งค่า Secret Key สำหรับ JWT Signing (`SECRET_KEY`)
- [ ] เปิดใช้งาน HTTPS / TLS ผ่าน Reverse Proxy (เช่น Nginx, Traefik, หรือ Caddy)
- [ ] กำหนดนโยบายสำรองข้อมูลฐานข้อมูลอัตโนมัติ (Automated PostgreSQL Dump)
