# คู่มือการสร้างโมดูลใหม่ด้วย CLI Scaffolder (`pnpm create:module`)

Organella มาพร้อมเครื่องมือ **Module Scaffolder CLI** ที่ช่วยให้นักพัฒนาสามารถสร้าง Micro-Frontend Module ใหม่ที่รองรับ **Module Federation**, **@organella/sdk** และ **Role-List Access Control** ได้ด้วยคำสั่งเดียว

---

## 1. คำสั่งสร้างโมดูลใหม่

รันคำสั่งต่อไปนี้ที่โฟลเดอร์รากของโปรเจกต์:

```bash
pnpm create:module <module-id> \
  --title "ชื่อโมดูลภาษาอังกฤษหรือไทย" \
  --tab-title "ชื่อแท็บที่จะแสดงบนหน้าจอ" \
  --port 5002 \
  --permissions "patient:read,medication:read,medication:dispense"
```

### ตัวอย่างการสร้างโมดูลห้องจ่ายยา (`pharmacy-dispense`)

```bash
pnpm create:module pharmacy-dispense \
  --title "Pharmacy Dispensing & Drug Safety" \
  --tab-title "ห้องจ่ายยา (Pharmacy Dispense)" \
  --port 5002 \
  --permissions "patient:read,medication:read,medication:dispense"
```

---

## 2. โครงสร้างไฟล์ที่ถูกสร้างขึ้นอัตโนมัติ

```text
modules/<module-id>/
├── manifest.json          # Metadata ของโมดูล, Slot ID และรายการสิทธิ์ (permissions)
├── package.json           # แพ็กเกจ @organella-module/<module-id>
├── tsconfig.json          # ตั้งค่า TypeScript
├── vite.config.ts         # ตั้งค่า Module Federation (remoteEntry.js)
├── index.html             # หน้า Standalone Preview สำหรับพัฒนาแยกอิสระ
└── src/
    ├── WorkspaceTab.tsx   # คอมโพเนนต์หลักพร้อม checkRequiredPermissions()
    ├── index.ts           # Export คอมโพเนนต์
    └── main.tsx           # Entry point สำหรับโหมด Standalone Preview
```

---

## 3. การตรวจสอบสิทธิ์ภายในโมดูล (`checkRequiredPermissions`)

ทุกโมดูลที่สร้างด้วย CLI จะใช้ฟังก์ชัน `checkRequiredPermissions` จาก `@organella/sdk` เพื่อตรวจสอบรายการสิทธิ์ที่ต้องใช้โดยไม่ผูกติดกับชื่อ Group:

```tsx
import { checkRequiredPermissions, useOrganellaContext } from '@organella/sdk';

export const REQUIRED_ROLES = ['patient:read', 'medication:read', 'medication:dispense'];

const { user } = useOrganellaContext();
const permCheck = checkRequiredPermissions(user?.permissions, REQUIRED_ROLES);

if (!permCheck.allowed) {
  // permCheck.missingRoles จะระบุรายการสิทธิ์ที่ขาดอย่างชัดเจน
}
```
