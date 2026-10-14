# 🏷️ Medical Terminology & Coding Standards

Organella มุ่งเน้นการปฏิบัติตามมาตรฐานการจัดหมวดหมู่ทางการแพทย์สากล เพื่อรองรับการแลกเปลี่ยนข้อมูลระหว่างโรงพยาบาล และการส่งเบิกประกันสุขภาพ

---

## 1. รหัสมาตรฐานที่รองรับในระบบ

### 1.1 การวินิจฉัยโรค: ICD-10 & ICD-11
- **ระบบหลัก:** ICD-10-TM (Thai Modification) / WHO ICD-10
- **URI มาตรฐานใน FHIR:** `http://hl7.org/fhir/sid/icd-10`
- **การนำไปใช้:** ใช้ในขั้นตอนการลงผลการวินิจฉัยโรคหลัก (Principal Diagnosis), โรคแทรกซ้อน (Complication), และโรคร่วม (Comorbidity)

### 1.2 ผลการตรวจทางห้องปฏิบัติการ: LOINC (Logical Observation Identifiers Names and Codes)
- **URI มาตรฐานใน FHIR:** `http://loinc.org`
- **การนำไปใช้:** ใช้ระบุประเภทการตรวจทางห้องปฏิบัติการ (เช่น Blood Glucose, HbA1c, Complete Blood Count)

### 1.3 ยาและเวชภัณฑ์: รหัสยามาตรฐาน TMT (Thai Medicines Terminology)
- **URI มาตรฐานใน FHIR:** `https://organella.health/terminology/tmt`
- **การนำไปใช้:** รหัสยา 24 หลักตามมาตรฐานกระทรวงสาธารณสุข สำหรับระบบคลังยาและการสั่งจ่ายยา

### 1.4 ศัพท์ทางการแพทย์และกายวิภาค: SNOMED CT
- **URI มาตรฐานใน FHIR:** `http://snomed.info/sct`
- **การนำไปใช้:** ระบุตำแหน่งกายวิภาค (Body Site), อาการสำคัญ (Finding), และหัตถการทางการแพทย์ (Procedure)
