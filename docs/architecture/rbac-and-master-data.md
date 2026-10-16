# Role-List Access Control (RBAC) & Master Data Management

เอกสารนี้อธิบายสถาปัตยกรรมการจัดการสิทธิ์แบบ **Role-List Access Control (PBAC)** และระบบ **Master Data Management** ของแพลตฟอร์ม **Organella**

---

## 1. หลักการออกแบบระบบสิทธิ์ (Role-List Access Control)

1. **1 User มีได้หลายสิทธิ์ (Multi-Group & Individual Granular Permissions)**
   - ผู้ใช้งาน 1 บัญชีสามารถได้รับมอบหมาย **Preset Role Groups** ได้มากกว่า 1 กลุ่ม (`auth_user_roles`)
   - และสามารถเลือกเปิด/ปิดสิทธิ์แบบ **รายหมวดหมู่ (Select Entire Group)** หรือ **รายสิทธิ์ย่อย (Individual Direct Permissions)** ได้โดยตรงผ่านตาราง `auth_user_permissions`
   - สิทธิ์ที่ผู้ใช้งานได้รับจริง (`effective_permissions`) คือผลรวม (Union) ของสิทธิ์จากทุก Role Group ร่วมกับสิทธิ์รายข้อที่เลือกเพิ่มเติม

2. **ตรวจสอบสิทธิ์จาก Role List ที่แต่ละหน้า/Endpoint ต้องใช้ (ไม่ตรวจจากชื่อ Group)**
   - ทั้งฝั่ง Backend (`require_permissions(["encounter:read", "encounter:sign", ...])`) และฝั่ง Frontend (`checkRequiredPermissions(user.permissions, requiredList)`) **จะไม่ตรวจสอบจากชื่อกลุ่ม (`Admin`, `Doctor`) และไม่ใช้ `is_superuser` ข้ามสิทธิ์ทางการแพทย์เด็ดขาด**
   - หากผู้ใช้งานขาดสิทธิ์ข้อใดข้อหนึ่งใน `requiredList` ระบบจะปฏิเสธการเข้าถึง (`HTTP 403 Forbidden`) พร้อมส่งรายการสิทธิ์ที่ขาด (`missing_roles`) กลับมาแสดงผลในข้อความแจ้งเตือนอย่างชัดเจน:
     ```json
     {
       "detail": {
         "message": "ปฏิเสธการเข้าถึง (Access Denied): ขาดสิทธิ์ที่จำเป็น [encounter:sign, condition:write, medication:prescribe]",
         "required_roles": ["encounter:read", "encounter:sign", "condition:write", "medication:prescribe"],
         "missing_roles": ["encounter:sign", "condition:write", "medication:prescribe"]
       }
     }
     ```

3. **การป้องกันการบันทึกหรือสั่งยาแทนแพทย์ (Strict Clinical Accountability)**
   - บังคับเข้าสู่ระบบด้วย JWT Token เสมอ (Mandatory Login Gate)
   - แยก Endpoint การคัดกรองของพยาบาล (`POST /api/v1/modules/doctor-opd/triage` — ใช้สิทธิ์ `["patient:read", "triage:write"]`) ออกจาก Endpoint การลงนามเวชระเบียนและสั่งยาของแพทย์ (`POST /api/v1/modules/doctor-opd/encounters` — ใช้สิทธิ์ `["encounter:read", "encounter:sign", "condition:write", "medication:prescribe"]`)
   - โหมดดูตัวอย่างโมดูลใน Host Shell (`Host Shell Module Preview`) สำหรับผู้ดูแลระบบ (`admin:modules`) จะถูกบังคับเป็น `readonly={true}` เสมอ

---

## 2. หมวดหมู่สิทธิ์ทั้ง 6 หมวด (6 Permission Groups)

| หมวดหมู่ (Group Name) | รายการสิทธิ์ย่อย (Granular Permissions) |
| :--- | :--- |
| **1. ทะเบียนผู้ป่วยและคิว (Patient & Queue)** | `patient:read`, `patient:write`, `queue:manage` |
| **2. การคัดกรองและสัญญาณชีพ (Nursing & Triage)** | `triage:read`, `triage:write` |
| **3. เวชระเบียนและการตรวจของแพทย์ (Doctor Consultation)** | `encounter:read`, `encounter:write`, `encounter:sign`, `condition:read`, `condition:write` |
| **4. การสั่งยาและห้องยา (Medication & Pharmacy)** | `medication:read`, `medication:write`, `medication:prescribe`, `medication:dispense` |
| **5. การจัดการข้อมูลหลัก (Master Data Management)** | `masterdata:icd10`, `masterdata:medications`, `masterdata:patients` |
| **6. การดูแลระบบและตรวจสอบ (System Admin & Audit)** | `admin:users`, `admin:roles`, `admin:modules`, `audit:read` |

---

## 3. ระบบจัดการและนำเข้าข้อมูลหลัก (Master Data Management & Bulk Import)

| ชุดข้อมูลหลัก | ตารางฐานข้อมูล | API Endpoints | สิทธิ์ที่ต้องใช้ (`requiredRoles`) |
| :--- | :--- | :--- | :--- |
| **รหัสโรคมาตรฐาน ICD-10** | `master_icd10_codes` | `GET /api/v1/master-data/icd10`<br/>`POST /api/v1/master-data/icd10`<br/>`POST /api/v1/master-data/icd10/import` | `["masterdata:icd10"]` |
| **บัญชียาโรงพยาบาล (Drug Formulary)** | `master_medications` | `GET /api/v1/master-data/medications`<br/>`POST /api/v1/master-data/medications`<br/>`POST /api/v1/master-data/medications/import` | `["masterdata:medications"]` |
| **ทะเบียนผู้ป่วย (MPI Bulk Import)** | `mpi_patients` | `POST /api/v1/master-data/patients/import` | `["masterdata:patients"]` |
| **ประวัติการใช้งาน (PDPA Audit Logs)** | `audit_logs` | `GET /api/v1/master-data/audit-logs` | `["audit:read"]` |
