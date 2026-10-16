## 📋 สรุปการเปลี่ยนแปลง (Summary of Changes)

- 

## 🔐 การตรวจสอบความปลอดภัยและมาตรฐานเวชระเบียน (Clinical Safety & RBAC Checklist)

- [ ] ตรวจสอบสิทธิ์ด้วยรายการสิทธิ์ (`require_permissions([...])` / `checkRequiredPermissions(...)`) โดย**ไม่ตรวจสอบจากชื่อ Group**
- [ ] แสดงรายการสิทธิ์ที่ขาด (`missing_roles`) ในข้อความแจ้งเตือนเมื่อเกิด `403 Forbidden`
- [ ] ไม่มีการอนุญาตให้บันทึกหรือสั่งการรักษาแทนแพทย์โดยไม่มี JWT Token และสิทธิ์ของแพทย์จริง
- [ ] บันทึก `AuditLog` สำหรับทุกการเปลี่ยนแปลงข้อมูลสุขภาพ (PDPA / HIPAA Compliance)
- [ ] รัน `pytest`, `ruff`, `pnpm typecheck` และ `pnpm build` ผ่านครบทั้งหมด
