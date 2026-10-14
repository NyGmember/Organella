# RFC-0000: [ชื่อข้อเสนอไอเดียโมดูลหรือฟังก์ชันการทำงาน]

- **ผู้เสนอ (Author):** [ชื่อ / GitHub Username]
- **สถานะ (Status):** [Draft | Under Review | Accepted | Rejected | Implemented]
- **วันที่เสนอ (Created Date):** [YYYY-MM-DD]
- **หมวดหมู่ (Category):** [New Module | Core Extension | FHIR Interop | Developer Tooling]

---

## 1. บทสรุปโดยย่อ (Summary)
[อธิบายสรุปใน 1-2 ย่อหน้าว่าข้อเสนอนี้ต้องการสร้างหรือปรับปรุงอะไร]

## 2. แรงจูงใจและความจำเป็น (Motivation)
- ปัญหาที่พบในสถานพยาบาล หรือข้อจำกัดในปัจจุบันคืออะไร?
- ทำไมวิธีแก้ไขในปัจจุบันจึงยังไม่เพียงพอ?

## 3. รายละเอียดการออกแบบ (Detailed Design)
### 3.1 การทำงานและ Flow ของผู้ใช้งาน (User Workflow)
[อธิบายขั้นตอนการใช้งานของแพทย์ พยาบาล หรือเจ้าหน้าที่]

### 3.2 จุดเชื่อมต่อกับ Organella Platform
- **UI Slots ที่ต้องการใช้:** (เช่น `patient-workspace-tab`, `dashboard-widget`)
- **Backend Hooks ที่ต้องการดักฟัง:** (เช่น `on_encounter_closed`)
- **FHIR Resources ที่เกี่ยวข้อง:** (เช่น `Observation`, `DiagnosticReport`)

## 4. ผลกระทบและความเข้ากันได้ (Drawbacks & Compatibility)
- มีผลกระทบต่อประสิทธิภาพ หรือการเข้ากันได้ของระบบเดิมหรือไม่?
- ต้องขอสิทธิ์ (Permissions) เพิ่มเติมอะไรบ้าง?
