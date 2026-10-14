# 🧩 Frontend Extension Slots Guide

Host Shell ของ Organella เตรียมจุดเชื่อมต่อ (Extension Slots) ไว้สำหรับให้โมดูลสามารถส่ง Remote Components เข้ามาแสดงผลตามตำแหน่งต่างๆ ของหน้าจอได้โดยอัตโนมัติ

---

## 1. จุดเชื่อมต่อ Extension Slots ที่รองรับ

| รหัส Slot ID | ตำแหน่งที่ปรากฏ | การใช้งานหลัก | Props ที่ส่งให้ Component |
| :--- | :--- | :--- | :--- |
| `patient-workspace-tab` | แท็บในหน้าจอแฟ้มประวัติผู้ป่วย | สำหรับระบบบันทึกอาการ, ใบสั่งยา, ผลแล็บ | `{ patientId, encounterId, readonly }` |
| `patient-banner-action` | ปุ่มกดเพิ่มเติมบนแถบสรุปผู้ป่วยด้านบน | สั่งพิมพ์บัตร, ป้ายเตือนพิเศษ, ปุ่มส่งต่อ | `{ patientId, patientData }` |
| `dashboard-widget` | กล่องสรุปผลในหน้าแรก (Home Dashboard) | แสดงคิวรอตรวจ, กราฟสรุปยอดผู้ป่วย | `{ currentUserId, facilityId }` |
| `main-nav-item` | เมนูลัดบนแถบนำทางหลักด้านข้าง (Sidebar) | เปิดหน้าจอหลักของโมดูลแบบเต็มจอ | `{ routePath, isActive }` |

---

## 2. วิธีพัฒนา Remote Component

### 2.1 ใช้ TypeScript Interface จาก `@organella/sdk`
เพื่อให้ Component รับ Props ได้ถูกต้องเสมอ ให้ Import Contract จาก SDK:

```tsx
import React from 'react';
import type { PatientTabProps } from '@organella/sdk';

export const ConsultationTab: React.FC<PatientTabProps> = ({ patientId, encounterId, readonly }) => {
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-2">บันทึกตรวจผู้ป่วย HN: {patientId}</h2>
      {/* รายละเอียดแบบฟอร์ม SOAP Note */}
    </div>
  );
};

export default ConsultationTab;
```

### 2.2 การตั้งค่า Vite Module Federation ในโมดูล
ในไฟล์ `vite.config.ts` ของโมดูล (`modules/<module-id>/ui/vite.config.ts`):

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'doctor_opd',
      filename: 'remoteEntry.js',
      exposes: {
        './ConsultationTab': './src/ConsultationTab.tsx',
        './DoctorQueueWidget': './src/DoctorQueueWidget.tsx',
      },
      shared: ['react', 'react-dom', '@organella/sdk'],
    }),
  ],
  server: {
    port: 5001,
  },
  build: {
    target: 'esnext',
  },
});
```
