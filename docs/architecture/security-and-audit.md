# 🔒 Security, RBAC and Audit Compliance

ระบบสารสนเทศสุขภาพจัดการข้อมูลที่มีความอ่อนไหวสูงมาก (Sensitive Personal Data) Organella จึงออกแบบระบบความปลอดภัยและการตรวจสอบตามแนวทาง **PDPA (พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562)** และ **HIPAA Security Rule**

---

## 1. Authentication & Role-Based Access Control (RBAC)

### 1.1 การยืนยันตัวตน (Authentication)
- การยืนยันตัวตนหลักใช้มาตรฐาน **JWT (JSON Web Token)** พร้อม Refresh Token Rotation
- รองรับการต่อขยายไปยัง OAuth2 / OpenID Connect (OIDC) เช่น Keycloak หรือ Hospital Active Directory

### 1.2 ระบบควบคุมสิทธิ์ (RBAC)
Organella ใช้ระบบสิทธิ์แบบ Granular Scopes:
- **ตัวอย่าง Scopes:**
  - `patient:read` - สิทธิ์ดูข้อมูลทั่วไปของผู้ป่วย
  - `patient:write` - สิทธิ์ลงทะเบียนหรือแก้ไขข้อมูลผู้ป่วย
  - `encounter:write` - สิทธิ์เปิดและบันทึกประวัติการตรวจ (Encounter)
  - `condition:write` - สิทธิ์ลงรหัสการวินิจฉัยโรค
  - `medication:write` - สิทธิ์สั่งจ่ายยา
  - `admin:modules` - สิทธิ์ติดตั้งและจัดการโมดูล

### 1.3 การจำกัดสิทธิ์ของโมดูล (Module Permission Sandboxing)
แต่ละโมดูลจะต้องประกาศ `permissions` ที่ต้องการใน `module.json`:
- Core Shell จะตรวจสอบว่าผู้ใช้ปัจจุบันมีสิทธิ์ดังกล่าวหรือไม่ก่อนเปิดให้ใช้งาน Slot
- หากผู้ใช้ไม่มีสิทธิ์ โมดูลจะไม่ถูก Mount หรือจะถูกปฏิเสธเมื่อส่ง Request ไปยัง Backend

---

## 2. Audit Trail & Logging Architecture

ทุกกิจกรรมที่เกี่ยวข้องกับการดู (Read), สร้าง (Create), แก้ไข (Update) หรือลบ (Delete) ข้อมูลผู้ป่วย จะต้องถูกบันทึกลง **Audit Log Table** โดยอัตโนมัติ

### 2.1 โครงสร้างข้อมูล Audit Log
```json
{
  "id": "uuid-v4",
  "timestamp": "2026-10-14T09:30:00Z",
  "user_id": "usr-1029",
  "user_name": "นพ. สมชาย ใจดี",
  "user_role": "Doctor",
  "action": "READ_PATIENT_CHART",
  "resource_type": "Patient",
  "resource_id": "pat-0091",
  "client_ip": "192.168.1.45",
  "user_agent": "Mozilla/5.0 ...",
  "module_id": "doctor-opd-consultation",
  "details": {
    "reason": "OPD Consultation visit #ENC-881"
  }
}
```

### 2.2 หลักการจัดเก็บที่ไม่สามารถแก้ไขได้ (Append-Only)
- ตาราง Audit Log จะเป็นตารางแบบ **Append-Only** (ไม่อนุญาตให้ `UPDATE` หรือ `DELETE`)
- ข้อมูล Audit Log จะถูกจัดทำ Index ตาม `timestamp`, `patient_id` และ `user_id` เพื่อรองรับการสืบค้นย้อนหลังในกรณีเกิดข้อร้องเรียนหรือการตรวจสอบความปลอดภัย
