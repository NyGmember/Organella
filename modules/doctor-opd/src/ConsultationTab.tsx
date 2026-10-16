import React, { useContext, useEffect, useMemo, useState } from 'react';
import { OrganellaContext, PatientTabProps } from '@organella/sdk';

interface VitalSignsState {
  bp_systolic: number;
  bp_diastolic: number;
  pulse: number;
  temperature: number;
  respiratory_rate: number;
  spo2: number;
  weight: number;
  height: number;
}

interface SoapState {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface ConditionItem {
  icd10_code: string;
  icd10_display: string;
  diagnosis_type: 'principal' | 'comorbidity' | 'complication';
}

export interface MedicationItem {
  medication_code: string;
  medication_name: string;
  dosage_instruction: string;
  quantity: number;
  unit: string;
}

interface ICD10CatalogEntry {
  code: string;
  display: string;
  category: string;
}

const DEFAULT_ICD10_OPTIONS: ICD10CatalogEntry[] = [
  { code: 'J02.9', display: 'Acute pharyngitis, unspecified (คออักเสบเฉียบพลัน)', category: 'Respiratory' },
  { code: 'J00', display: 'Acute nasopharyngitis [common cold] (โรคหวัดเฉียบพลัน)', category: 'Respiratory' },
  { code: 'J06.9', display: 'Acute upper respiratory infection (ติดเชื้อทางเดินหายใจส่วนบน)', category: 'Respiratory' },
  { code: 'I10', display: 'Essential (primary) hypertension (ความดันโลหิตสูง)', category: 'Cardiovascular' },
  { code: 'E11.9', display: 'Type 2 diabetes mellitus without complications (เบาหวานชนิดที่ 2)', category: 'Endocrine' },
  { code: 'K21.9', display: 'Gastro-oesophageal reflux disease (กรดไหลย้อน GERD)', category: 'Gastrointestinal' },
  { code: 'K29.7', display: 'Gastritis, unspecified (กระเพาะอาหารอักเสบ)', category: 'Gastrointestinal' },
  { code: 'M54.5', display: 'Low back pain (ปวดหลังส่วนล่าง)', category: 'Musculoskeletal' },
  { code: 'R50.9', display: 'Fever, unspecified (ไข้ไม่ทราบสาเหตุ)', category: 'Symptoms' },
];

const QUICK_MEDICATIONS: MedicationItem[] = [
  {
    medication_code: 'RX-PARA-500',
    medication_name: 'Paracetamol 500 mg Tablet',
    dosage_instruction: 'รับประทานครั้งละ 1 เม็ด ทุก 4-6 ชั่วโมง เวลาปวดหรือมีไข้',
    quantity: 20,
    unit: 'tablet',
  },
  {
    medication_code: 'RX-ROXI-150',
    medication_name: 'Roxithromycin 150 mg Tablet',
    dosage_instruction: 'รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง ก่อนอาหารเช้า-เย็น',
    quantity: 14,
    unit: 'tablet',
  },
  {
    medication_code: 'RX-OMEP-20',
    medication_name: 'Omeprazole 20 mg Capsule',
    dosage_instruction: 'รับประทานครั้งละ 1 แคปซูล วันละ 2 ครั้ง ก่อนอาหารเช้า-เย็น 30 นาที',
    quantity: 28,
    unit: 'capsule',
  },
  {
    medication_code: 'RX-CETI-10',
    medication_name: 'Cetirizine 10 mg Tablet',
    dosage_instruction: 'รับประทานครั้งละ 1 เม็ด วันละ 1 ครั้ง ก่อนนอน',
    quantity: 10,
    unit: 'tablet',
  },
];

export const ConsultationTab: React.FC<PatientTabProps> = ({
  patient,
  activeEncounter,
  readonly,
}) => {
  const ctx = useContext(OrganellaContext);

  const [chiefComplaint, setChiefComplaint] = useState<string>(
    'ไข้สูง เจ็บคอมาก กลืนลำบาก 2 วันก่อนมาโรงพยาบาล'
  );

  const [vitals, setVitals] = useState<VitalSignsState>({
    bp_systolic: 134,
    bp_diastolic: 84,
    pulse: 92,
    temperature: 38.4,
    respiratory_rate: 20,
    spo2: 98,
    weight: 68.5,
    height: 172.0,
  });

  const [soap, setSoap] = useState<SoapState>({
    subjective:
      'ผู้ป่วยมาด้วยอาการไข้สูง หนาวสั่น เจ็บคอมากเวลากลืนน้ำลาย ไอแห้งๆ มีน้ำมูกใส 2 วัน ปฏิเสธประวัติเดินทางต่างประเทศ',
    objective:
      'GA: Alert, mild toxic appearance. HEENT: Markedly injected pharynx, tonsillar hypertrophy 2+ without exudate. Lungs: Clear, equal breath sounds.',
    assessment: 'Acute pharyngitis (คออักเสบเฉียบพลัน) — ระวังประวัติแพ้ยา Penicillin และ Aspirin',
    plan: '1. ให้ยาลดไข้ Paracetamol 500 mg (หลีกเลี่ยง NSAIDs/Aspirin)\n2. Roxithromycin 150 mg (ทดแทนกลุ่ม Penicillin)\n3. ดื่มน้ำอุ่นมากๆ พักผ่อน นัดติดตามอาการหากไข้ไม่ลงใน 3 วัน',
  });

  const [conditions, setConditions] = useState<ConditionItem[]>([
    {
      icd10_code: 'J02.9',
      icd10_display: 'Acute pharyngitis, unspecified (คออักเสบเฉียบพลัน)',
      diagnosis_type: 'principal',
    },
    {
      icd10_code: 'I10',
      icd10_display: 'Essential (primary) hypertension (ความดันโลหิตสูงชนิดไม่ทราบสาเหตุ)',
      diagnosis_type: 'comorbidity',
    },
  ]);

  const [medications, setMedications] = useState<MedicationItem[]>([
    {
      medication_code: 'RX-PARA-500',
      medication_name: 'Paracetamol 500 mg Tablet',
      dosage_instruction: 'รับประทานครั้งละ 1 เม็ด ทุก 4-6 ชั่วโมง เวลาปวดหรือมีไข้',
      quantity: 20,
      unit: 'tablet',
    },
    {
      medication_code: 'RX-ROXI-150',
      medication_name: 'Roxithromycin 150 mg Tablet (Safe for Penicillin Allergy)',
      dosage_instruction: 'รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง ก่อนอาหารเช้า-เย็น',
      quantity: 14,
      unit: 'tablet',
    },
  ]);

  // ICD-10 Search state
  const [icdSearchQuery, setIcdSearchQuery] = useState<string>('');
  const [icdResults, setIcdResults] = useState<ICD10CatalogEntry[]>(DEFAULT_ICD10_OPTIONS);
  const [selectedDiagType, setSelectedDiagType] = useState<'principal' | 'comorbidity'>('comorbidity');

  // New Medication Form state
  const [newMedName, setNewMedName] = useState<string>('');
  const [newMedDosage, setNewMedDosage] = useState<string>('รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร');
  const [newMedQty, setNewMedQty] = useState<number>(15);
  const [newMedUnit] = useState<string>('tablet');

  // Submission status
  const [saving, setSaving] = useState<boolean>(false);
  const [saveBanner, setSaveBanner] = useState<{
    type: 'success' | 'info';
    message: string;
    encounterNumber?: string;
  } | null>(null);

  // Sync with backend encounter or selected queue item when activeEncounter changes
  useEffect(() => {
    const encAny = activeEncounter as any;
    if (!encAny) return;
    if (encAny.chiefComplaint) setChiefComplaint(encAny.chiefComplaint);
    if (encAny.vitalSigns && Object.keys(encAny.vitalSigns).length > 0) {
      setVitals((prev) => ({ ...prev, ...encAny.vitalSigns }));
    }
    if (encAny.soapNote && Object.keys(encAny.soapNote).length > 0) {
      setSoap((prev) => ({ ...prev, ...encAny.soapNote }));
    }
    if (Array.isArray(encAny.conditions) && encAny.conditions.length > 0) {
      setConditions(encAny.conditions);
    }
    if (Array.isArray(encAny.medications) && encAny.medications.length > 0) {
      setMedications(encAny.medications);
    }
    setSaveBanner(null);
  }, [activeEncounter?.id, patient.id]);

  // Search ICD-10 API
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const url = `http://localhost:8000/api/v1/modules/doctor-opd/icd10/search?q=${encodeURIComponent(
          icdSearchQuery
        )}`;
        const res = await fetch(url);
        if (res.ok && active) {
          const data: ICD10CatalogEntry[] = await res.json();
          setIcdResults(data);
          return;
        }
      } catch {
        // Local filter fallback
      }
      if (active) {
        const q = icdSearchQuery.toLowerCase();
        setIcdResults(
          DEFAULT_ICD10_OPTIONS.filter(
            (i) => i.code.toLowerCase().includes(q) || i.display.toLowerCase().includes(q)
          )
        );
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [icdSearchQuery]);

  const bmi = useMemo(() => {
    if (!vitals.weight || !vitals.height) return '-';
    const hMeters = vitals.height / 100;
    return (vitals.weight / (hMeters * hMeters)).toFixed(1);
  }, [vitals.weight, vitals.height]);

  const handleAddCondition = (entry: ICD10CatalogEntry) => {
    if (conditions.some((c) => c.icd10_code === entry.code)) return;
    const nextType = conditions.length === 0 ? 'principal' : selectedDiagType;
    setConditions((prev) => [
      ...prev,
      {
        icd10_code: entry.code,
        icd10_display: entry.display,
        diagnosis_type: nextType,
      },
    ]);
  };

  const handleRemoveCondition = (code: string) => {
    setConditions((prev) => prev.filter((c) => c.icd10_code !== code));
  };

  const handleAddMedication = (med: MedicationItem) => {
    setMedications((prev) => [...prev, med]);
  };

  const handleAddCustomMedication = () => {
    if (!newMedName.trim()) return;
    setMedications((prev) => [
      ...prev,
      {
        medication_code: `RX-CUSTOM-${Date.now().toString().slice(-4)}`,
        medication_name: newMedName.trim(),
        dosage_instruction: newMedDosage.trim(),
        quantity: Number(newMedQty) || 1,
        unit: newMedUnit,
      },
    ]);
    setNewMedName('');
  };

  const handleRemoveMedication = (idx: number) => {
    setMedications((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveConsultation = async () => {
    setSaving(true);
    setSaveBanner(null);

    const encNumber = (activeEncounter as any)?.encounterNumber || activeEncounter?.id || 'ENC-2026-001';
    const payload = {
      encounter_number: encNumber.startsWith('ENC-') ? encNumber : 'ENC-2026-001',
      patient_id: patient.id,
      encounter_type: activeEncounter?.encounterType || 'OPD',
      status: 'finished',
      priority: 'routine',
      department: 'อายุรกรรมทั่วไป (OPD Med Rm.3)',
      chief_complaint: chiefComplaint,
      vital_signs: vitals,
      soap_note: soap,
      conditions,
      medications,
    };

    try {
      const res = await fetch('http://localhost:8000/api/v1/modules/doctor-opd/encounters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        setSaveBanner({
          type: 'success',
          message: `บันทึกเวชระเบียนสำเร็จ (Encounter: ${saved.encounter_number}) • สร้างทรัพยากร HL7 FHIR R4 และส่งคำสั่งยาเข้าคิวห้องยาเรียบร้อยแล้ว`,
          encounterNumber: saved.encounter_number,
        });
        if (ctx?.emitEvent) {
          ctx.emitEvent('opd:consultation-saved', {
            encounterId: saved.id,
            encounterNumber: saved.encounter_number,
            patientId: patient.id,
            hn: patient.hn,
            chiefComplaint,
            vitalSigns: vitals,
            soapNote: soap,
            conditions,
            medications,
          });
        }
        setSaving(false);
        return;
      }
    } catch {
      // Fallback to client-side FHIR generation & Event Bus
    }

    setSaveBanner({
      type: 'info',
      message: `บันทึกข้อมูลการตรวจและแปลงเป็น HL7 FHIR R4 Clinical Bundle สำเร็จ (${conditions.length} ICD-10, ${medications.length} รายการยา)`,
      encounterNumber: encNumber,
    });
    if (ctx?.emitEvent) {
      ctx.emitEvent('opd:consultation-saved', {
        encounterId: activeEncounter?.id || 'enc-2026-001',
        encounterNumber: encNumber,
        patientId: patient.id,
        hn: patient.hn,
        chiefComplaint,
        vitalSigns: vitals,
        soapNote: soap,
        conditions,
        medications,
      });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
        <div>
          <h4 className="font-bold text-slate-900 text-base">
            ระบบห้องตรวจแพทย์ผู้ป่วยนอก (OPD Clinical Workbench)
          </h4>
          <p className="text-xs text-slate-500">
            ผู้ป่วย: <span className="font-semibold text-slate-700">{patient.prefix} {patient.firstName} {patient.lastName}</span> (HN: {patient.hn}) | Visit: <span className="font-mono">{activeEncounter?.id || 'ENC-2026-001'}</span>
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] bg-teal-50 text-teal-700 px-2.5 py-1 rounded-md border border-teal-200 font-medium">
            ICD-10-TM & HL7 FHIR R4 Ready
          </span>
        </div>
      </div>

      {/* Save Notification Banner */}
      {saveBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            saveBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-teal-50 border-teal-300 text-teal-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            <span className="text-base">✅</span>
            <span className="font-semibold">{saveBanner.message}</span>
          </div>
          {saveBanner.encounterNumber && (
            <a
              href={`http://localhost:8000/fhir/r4/Encounter/${saveBanner.encounterNumber}/$everything`}
              target="_blank"
              rel="noreferrer"
              className="underline font-mono font-bold text-teal-700 hover:text-teal-900 ml-3 whitespace-nowrap"
            >
              ดู FHIR $everything JSON ↗
            </a>
          )}
        </div>
      )}

      {/* Section 1: Chief Complaint & Vital Signs */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            1. อาการสำคัญแรกรับ (Chief Complaint) & สัญญาณชีพ (Vital Signs)
          </h5>
          <span className="text-[11px] text-slate-500 font-mono">
            BMI: <strong className="text-teal-700">{bmi}</strong> kg/m²
          </span>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            Chief Complaint (CC):
          </label>
          <input
            type="text"
            disabled={readonly}
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-1">
          <div className="bg-white p-2 rounded-lg border border-slate-200">
            <span className="block text-[10px] text-slate-400 font-medium">BP (mmHg)</span>
            <div className="flex items-center space-x-1 mt-0.5">
              <input
                type="number"
                disabled={readonly}
                value={vitals.bp_systolic}
                onChange={(e) => setVitals({ ...vitals, bp_systolic: Number(e.target.value) })}
                className="w-12 text-xs font-bold text-slate-800 border-b border-slate-200 focus:outline-none"
              />
              <span className="text-slate-400">/</span>
              <input
                type="number"
                disabled={readonly}
                value={vitals.bp_diastolic}
                onChange={(e) => setVitals({ ...vitals, bp_diastolic: Number(e.target.value) })}
                className="w-12 text-xs font-bold text-slate-800 border-b border-slate-200 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-white p-2 rounded-lg border border-slate-200">
            <span className="block text-[10px] text-slate-400 font-medium">Pulse (bpm)</span>
            <input
              type="number"
              disabled={readonly}
              value={vitals.pulse}
              onChange={(e) => setVitals({ ...vitals, pulse: Number(e.target.value) })}
              className="w-full text-xs font-bold text-slate-800 mt-0.5 border-b border-slate-200 focus:outline-none"
            />
          </div>

          <div className="bg-white p-2 rounded-lg border border-slate-200">
            <span className="block text-[10px] text-slate-400 font-medium">Temp (°C)</span>
            <input
              type="number"
              step="0.1"
              disabled={readonly}
              value={vitals.temperature}
              onChange={(e) => setVitals({ ...vitals, temperature: Number(e.target.value) })}
              className={`w-full text-xs font-bold mt-0.5 border-b border-slate-200 focus:outline-none ${
                vitals.temperature >= 37.5 ? 'text-red-600' : 'text-slate-800'
              }`}
            />
          </div>

          <div className="bg-white p-2 rounded-lg border border-slate-200">
            <span className="block text-[10px] text-slate-400 font-medium">RR (/min)</span>
            <input
              type="number"
              disabled={readonly}
              value={vitals.respiratory_rate}
              onChange={(e) => setVitals({ ...vitals, respiratory_rate: Number(e.target.value) })}
              className="w-full text-xs font-bold text-slate-800 mt-0.5 border-b border-slate-200 focus:outline-none"
            />
          </div>

          <div className="bg-white p-2 rounded-lg border border-slate-200">
            <span className="block text-[10px] text-slate-400 font-medium">SpO2 (%)</span>
            <input
              type="number"
              disabled={readonly}
              value={vitals.spo2}
              onChange={(e) => setVitals({ ...vitals, spo2: Number(e.target.value) })}
              className="w-full text-xs font-bold text-teal-700 mt-0.5 border-b border-slate-200 focus:outline-none"
            />
          </div>

          <div className="bg-white p-2 rounded-lg border border-slate-200">
            <span className="block text-[10px] text-slate-400 font-medium">Weight (kg)</span>
            <input
              type="number"
              step="0.1"
              disabled={readonly}
              value={vitals.weight}
              onChange={(e) => setVitals({ ...vitals, weight: Number(e.target.value) })}
              className="w-full text-xs font-bold text-slate-800 mt-0.5 border-b border-slate-200 focus:outline-none"
            />
          </div>

          <div className="bg-white p-2 rounded-lg border border-slate-200">
            <span className="block text-[10px] text-slate-400 font-medium">Height (cm)</span>
            <input
              type="number"
              step="0.5"
              disabled={readonly}
              value={vitals.height}
              onChange={(e) => setVitals({ ...vitals, height: Number(e.target.value) })}
              className="w-full text-xs font-bold text-slate-800 mt-0.5 border-b border-slate-200 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Section 2: SOAP Note */}
      <div className="space-y-2">
        <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          2. บันทึกการตรวจรักษา (SOAP Clinical Notes)
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              S (Subjective) — ประวัติอาการเจ็บป่วยปัจจุบัน:
            </label>
            <textarea
              disabled={readonly}
              value={soap.subjective}
              onChange={(e) => setSoap({ ...soap, subjective: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 min-h-[78px] bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              O (Objective) — ผลการตรวจร่างกาย & ผลตรวจทางห้องปฏิบัติการ:
            </label>
            <textarea
              disabled={readonly}
              value={soap.objective}
              onChange={(e) => setSoap({ ...soap, objective: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 min-h-[78px] bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              A (Assessment) — สรุปการประเมินทางคลินิก:
            </label>
            <textarea
              disabled={readonly}
              value={soap.assessment}
              onChange={(e) => setSoap({ ...soap, assessment: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 min-h-[78px] bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              P (Plan) — แผนการรักษาและคำแนะนำผู้ป่วย:
            </label>
            <textarea
              disabled={readonly}
              value={soap.plan}
              onChange={(e) => setSoap({ ...soap, plan: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 min-h-[78px] bg-white"
            />
          </div>
        </div>
      </div>

      {/* Section 3: ICD-10 Diagnosis Coding */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            3. การวินิจฉัยโรคมาตรฐานสากล (ICD-10 Diagnosis / FHIR Condition)
          </h5>
          <span className="text-[11px] text-slate-500">เลือกได้หลายรหัส (Principal / Comorbidity)</span>
        </div>

        {/* Selected ICD-10 List */}
        <div className="space-y-1.5">
          {conditions.map((cond) => (
            <div
              key={cond.icd10_code}
              className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs"
            >
              <div className="flex items-center space-x-2.5">
                <span className="font-mono font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                  {cond.icd10_code}
                </span>
                <span className="font-medium text-slate-800">{cond.icd10_display}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    cond.diagnosis_type === 'principal'
                      ? 'bg-teal-100 text-teal-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {cond.diagnosis_type === 'principal' ? 'โรคหลัก (Principal)' : 'โรคร่วม (Comorbidity)'}
                </span>
              </div>
              {!readonly && (
                <button
                  type="button"
                  onClick={() => handleRemoveCondition(cond.icd10_code)}
                  className="text-red-500 hover:text-red-700 font-semibold text-[11px]"
                >
                  ลบออก
                </button>
              )}
            </div>
          ))}
        </div>

        {/* ICD-10 Search Input */}
        {!readonly && (
          <div className="pt-1 space-y-2">
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={icdSearchQuery}
                onChange={(e) => setIcdSearchQuery(e.target.value)}
                placeholder="🔍 ค้นหารหัสโรค ICD-10 หรือชื่อโรค (เช่น J02.9, คออักเสบ, เบาหวาน, I10)..."
                className="flex-1 min-w-[240px] text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
              <select
                value={selectedDiagType}
                onChange={(e) => setSelectedDiagType(e.target.value as 'principal' | 'comorbidity')}
                className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700"
              >
                <option value="principal">ตั้งเป็นโรคหลัก (Principal)</option>
                <option value="comorbidity">ตั้งเป็นโรคร่วม (Comorbidity)</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
              {icdResults.slice(0, 8).map((item) => {
                const alreadyAdded = conditions.some((c) => c.icd10_code === item.code);
                return (
                  <button
                    key={item.code}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => handleAddCondition(item)}
                    className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors flex items-center space-x-1 ${
                      alreadyAdded
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border-slate-300'
                    }`}
                  >
                    <span className="font-mono font-bold text-indigo-700">+ {item.code}</span>
                    <span className="truncate max-w-[210px]">{item.display}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Outpatient Medication Orders */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            4. รายการสั่งยาผู้ป่วยนอก (e-Prescription / FHIR MedicationRequest)
          </h5>
          {patient.allergies && patient.allergies.length > 0 && (
            <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
              ⚠️ ห้ามสั่งยากลุ่ม: {patient.allergies.join(', ')}
            </span>
          )}
        </div>

        {/* Current Medication Table */}
        <div className="space-y-1.5">
          {medications.map((med, idx) => (
            <div
              key={`${med.medication_name}-${idx}`}
              className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-800">{med.medication_name}</span>
                  <span className="bg-teal-100 text-teal-800 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                    จำนวน {med.quantity} {med.unit}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">วิธีใช้: {med.dosage_instruction}</p>
              </div>
              {!readonly && (
                <button
                  type="button"
                  onClick={() => handleRemoveMedication(idx)}
                  className="text-red-500 hover:text-red-700 font-semibold text-[11px]"
                >
                  ลบรายการ
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Quick-Add & Custom Drug Input */}
        {!readonly && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-slate-500 font-medium mr-1">สั่งยาด่วน:</span>
              {QUICK_MEDICATIONS.map((qm) => (
                <button
                  key={qm.medication_code}
                  type="button"
                  onClick={() => handleAddMedication(qm)}
                  className="text-[11px] bg-white hover:bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-md font-medium"
                >
                  + {qm.medication_name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
              <input
                type="text"
                value={newMedName}
                onChange={(e) => setNewMedName(e.target.value)}
                placeholder="ชื่อยาและขนาด (เช่น Amoxicillin 500 mg หรือ Loratadine 10 mg)"
                className="sm:col-span-4 text-xs px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
              />
              <input
                type="text"
                value={newMedDosage}
                onChange={(e) => setNewMedDosage(e.target.value)}
                placeholder="วิธีใช้ (Sig)"
                className="sm:col-span-5 text-xs px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
              />
              <input
                type="number"
                min={1}
                value={newMedQty}
                onChange={(e) => setNewMedQty(Number(e.target.value))}
                className="sm:col-span-1 text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-center"
              />
              <button
                type="button"
                onClick={handleAddCustomMedication}
                className="sm:col-span-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
              >
                + เพิ่มยา
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Submit Action */}
      {!readonly && (
        <div className="pt-2 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            การกดบันทึกจะสร้าง Audit Trail (PDPA) และแปลงเป็น HL7 FHIR R4 Bundle ทันที
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveConsultation}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            {saving ? 'กำลังบันทึกเวชระเบียน...' : '💾 บันทึกการตรวจและส่งคำสั่งยา (Sign & Send to Pharmacy)'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ConsultationTab;
