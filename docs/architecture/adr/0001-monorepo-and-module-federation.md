# ADR-0001: Monorepo Architecture and Vite Module Federation for Micro-Frontends

- **สถานะ (Status):** Accepted
- **ผู้ตัดสินใจ (Deciders):** Core Architecture Team
- **วันที่ (Date):** 2026-10-14
- **ตั๋วงานที่เกี่ยวข้อง (Ticket):** ORG-1, ORG-3

---

## 1. บริบทและปัญหา (Context and Problem Statement)
Organella ออกแบบให้เป็น Generic Health Engine ที่ฟังก์ชันทางการแพทย์ทั้งหมด (OPD, IPD, ห้องยา, คลังเวชภัณฑ์) ทำงานในลักษณะโมดูลอิสระ (Pluggable Modules) ที่สถานพยาบาลสามารถเลือกติดตั้งหรือถอดถอนได้เหมือน App Store

ความท้าทายหลักคือ:
1. การบริหารจัดการโค้ดของ Core Shell, SDK และโมดูลตั้งต้น (First-party Modules) ให้อยู่ในการควบคุมคุณภาพและวงรอบการพัฒนาเดียวกัน
2. การโหลด UI ของโมดูลจากภายนอกหรือแยก Deploy เข้าสู่หน้าจอหลักของ Host Shell ได้แบบ Runtime โดยไม่ต้อง Re-build หรือ Re-deploy Host Shell ใหม่ทั้งหมด
3. ความเร็วในการรัน Dev Server และ Build Performance

## 2. ตัวเลือกที่พิจารณา (Considered Options)
1. **Multi-Repo + Iframe Embedding:** แยกทุกโมดูลเป็น repo อิสระ และฝังผ่าน iframe ในหน้าจอหลัก
   - *ข้อดี:* Sandbox สมบูรณ์แบบ ไม่กวนกัน
   - *ข้อเสีย:* การแชร์ UI Theme, State (เช่น Active Patient Context), ประสบการณ์ใช้งาน (UX) ตะกุกตะกัก และปัญหา Performance
2. **Webpack Module Federation (Polyrepo / Monorepo):** ใช้ Webpack 5 Module Federation
   - *ข้อดี:* มี ecosystem กว้างขวาง
   - *ข้อเสีย:* ความเร็วการ Build และ Developer Experience (HMR) ช้ากว่า Vite มาก
3. **Monorepo (pnpm workspace) + Vite Module Federation (`@originjs/vite-plugin-federation`):**
   - *ข้อดี:* พัฒนาได้รวดเร็วมากด้วย Vite, รองรับ Shared Dependencies (`react`, `react-dom`, `@organella/sdk`), จัดการ Type และ Package ภายในได้สะดวกด้วย pnpm workspace

## 3. ผลการตัดสินใจ (Decision Outcome)
**ตัวเลือกที่เลือก:** Monorepo (pnpm workspace) ร่วมกับ Vite Module Federation

### ผลกระทบเชิงบวก (Positive Consequences)
- **Runtime Pluggability:** Host Shell สามารถ Fetch `remoteEntry.js` ของแต่ละโมดูลเข้ามา Mount บน Extension Slots (เช่น `PatientBanner`, `PatientTab`, `DashboardWidget`) ได้แบบไดนามิก
- **Shared State & React Context:** สามารถส่งผ่าน `PatientContext` และ `AuthContext` จาก Host Shell ไปยัง Remote Modules ได้อย่างไร้รอยต่อ
- **Unified DX:** นักพัฒนาสามารถรัน Core และ Module ร่วมกันในเครื่องเพื่อทดสอบได้ทันที

### ผลกระทบเชิงลบ / ความเสี่ยง (Negative Consequences & Risks)
- ต้องควบคุม Dependency Version ของ React และ CSS ป้องกันไม่ให้ Class ของโมดูลชนกัน (แก้ไขโดยกำหนดข้อกำหนดการใช้ Tailwind scope / CSS module prefix)

## 4. แผนการนำไปปฏิบัติ (Implementation Notes)
- จัดโครงสร้าง Monorepo เป็น `apps/host-shell`, `apps/core-api`, `packages/organella-sdk`, `modules/*`
- ใช้ `pnpm-workspace.yaml` ในการลิงก์ packages ภายใน
