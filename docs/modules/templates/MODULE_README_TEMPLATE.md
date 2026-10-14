# 📦 [Module Name]

> **Module ID:** `[module-id]`  
> **Version:** `1.0.0`  
> **Author:** [Author / Organization]  
> **Target License:** AGPL-3.0  

---

## 1. วัตถุประสงค์และการทำงาน (Purpose & Features)
[อธิบายว่าโมดูลนี้ทำหน้าที่อะไร แก้ปัญหาจุดไหนในโรงพยาบาล และช่วยบุคลากรทางการแพทย์อย่างไร]

### ฟีเจอร์หลัก (Key Features)
- [ฟีเจอร์ 1]
- [ฟีเจอร์ 2]
- [ฟีเจอร์ 3]

---

## 2. จุดเชื่อมต่อ Extension Slots (Frontend UI)
โมดูลนี้เสียบเข้าสู่ Host Shell ผ่าน Slots ดังต่อไปนี้:
- **`patient-workspace-tab`:** [อธิบายหน้าที่ของ Tab]
- **`dashboard-widget`:** [อธิบายหน้าที่ของ Widget]

---

## 3. สิทธิ์การใช้งานที่ต้องการ (Required Permissions)
- `patient:read`: [เหตุผลที่ต้องใช้สิทธิ์]
- `encounter:write`: [เหตุผลที่ต้องใช้สิทธิ์]

---

## 4. มาตรฐานข้อมูลทางการแพทย์ (Medical Standards Mapping)
- **FHIR Resources ที่เกี่ยวข้อง:** `Patient`, `Encounter`, `Condition`
- **รหัสมาตรฐานที่ใช้:** ICD-10, LOINC

---

## 5. วิธีทดสอบและรันใน Local Development
```bash
# รันเฉพาะส่วน UI ของโมดูล
pnpm --filter @organella-module/[module-id] dev
```
