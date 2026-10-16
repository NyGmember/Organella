import React, { useContext, useEffect, useState } from 'react';
import { DashboardWidgetProps, OrganellaContext } from '@organella/sdk';

export interface OpdQueueItem {
  encounter_id: string;
  encounter_number: string;
  queue_number: string;
  status: string;
  priority: string;
  department: string;
  chief_complaint?: string;
  started_at: string;
  patient_id: string;
  hn: string;
  patient_name: string;
  gender: string;
  birth_date: string;
  blood_group?: string;
  allergies: string[];
  vital_signs: Record<string, any>;
  soap_note: Record<string, any>;
  conditions: Array<{
    id?: string;
    icd10_code: string;
    icd10_display: string;
    diagnosis_type: string;
  }>;
  medications: Array<{
    id?: string;
    medication_code?: string;
    medication_name: string;
    dosage_instruction: string;
    quantity: number;
    unit: string;
  }>;
}

const FALLBACK_QUEUE: OpdQueueItem[] = [
  {
    encounter_id: 'enc-2026-001',
    encounter_number: 'ENC-2026-001',
    queue_number: 'A-014',
    status: 'in-progress',
    priority: 'urgent',
    department: 'อายุรกรรมทั่วไป (OPD Med Rm.3)',
    chief_complaint: 'ไข้สูง เจ็บคอมาก กลืนลำบาก 2 วันก่อนมาโรงพยาบาล',
    started_at: new Date().toISOString(),
    patient_id: 'pat-0001',
    hn: 'HN-2026-0001',
    patient_name: 'นาย สมชาย ใจดี',
    gender: 'male',
    birth_date: '1978-05-14',
    blood_group: 'O+',
    allergies: ['Penicillin (ผื่นลมพิษเฉียบพลัน)', 'Aspirin (หลอดลมตีบ)'],
    vital_signs: {
      bp_systolic: 134,
      bp_diastolic: 84,
      pulse: 92,
      temperature: 38.4,
      respiratory_rate: 20,
      spo2: 98,
      weight: 68.5,
      height: 172.0,
    },
    soap_note: {
      subjective:
        'ผู้ป่วยชายไทยคู่ อายุ 48 ปี มาด้วยอาการไข้สูง หนาวสั่น เจ็บคอมากเวลากลืนน้ำลาย ไอแห้งๆ มีน้ำมูกใส 2 วัน',
      objective:
        'GA: Alert, mild toxic appearance. HEENT: Markedly injected pharynx, tonsillar hypertrophy 2+ without exudate.',
      assessment: 'Acute pharyngitis (คออักเสบเฉียบพลัน) — ระวังประวัติแพ้ยา Penicillin และ Aspirin',
      plan: '1. Paracetamol 500 mg (หลีกเลี่ยง NSAIDs/Aspirin)\n2. Roxithromycin 150 mg (ทดแทนกลุ่ม Penicillin)',
    },
    conditions: [
      {
        icd10_code: 'J02.9',
        icd10_display: 'Acute pharyngitis, unspecified (คออักเสบเฉียบพลัน)',
        diagnosis_type: 'principal',
      },
    ],
    medications: [
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
    ],
  },
  {
    encounter_id: 'enc-2026-002',
    encounter_number: 'ENC-2026-002',
    queue_number: 'A-015',
    status: 'arrived',
    priority: 'routine',
    department: 'อายุรกรรมทั่วไป (OPD Med Rm.3)',
    chief_complaint: 'จุกแสบลิ้นปี่ เรอเปรี้ยว หลังอาหารมื้อเย็น เป็นมา 1 สัปดาห์',
    started_at: new Date().toISOString(),
    patient_id: 'pat-0002',
    hn: 'HN-2026-0002',
    patient_name: 'นางสาว วิภาวี สุขสวัสดิ์',
    gender: 'female',
    birth_date: '1989-11-22',
    blood_group: 'B+',
    allergies: [],
    vital_signs: {
      bp_systolic: 116,
      bp_diastolic: 74,
      pulse: 76,
      temperature: 36.6,
      respiratory_rate: 16,
      spo2: 99,
      weight: 54.0,
      height: 161.0,
    },
    soap_note: {
      subjective: 'จุกแสบยอดอกและลิ้นปี่ เรอเปรี้ยว โดยเฉพาะเวลาเอนตัวนอนหลังอาหารเย็น',
      objective: 'Abdomen: Soft, mild tenderness at epigastrium, normal bowel sounds.',
      assessment: 'Gastro-oesophageal reflux disease without oesophagitis (GERD)',
      plan: '1. Omeprazole 20 mg ก่อนอาหารเช้า-เย็น\n2. งดอาหารรสจัด กาแฟ',
    },
    conditions: [
      {
        icd10_code: 'K21.9',
        icd10_display: 'Gastro-oesophageal reflux disease without oesophagitis (กรดไหลย้อน GERD)',
        diagnosis_type: 'principal',
      },
    ],
    medications: [
      {
        medication_code: 'RX-OMEP-20',
        medication_name: 'Omeprazole 20 mg Capsule',
        dosage_instruction: 'รับประทานครั้งละ 1 แคปซูล วันละ 2 ครั้ง ก่อนอาหารเช้า-เย็น',
        quantity: 28,
        unit: 'capsule',
      },
    ],
  },
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  'in-progress': {
    label: 'กำลังตรวจ',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  arrived: {
    label: 'รอเรียกตรวจ',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  triaged: {
    label: 'คัดกรองแล้ว',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  finished: {
    label: 'ตรวจเสร็จสิ้น',
    className: 'bg-slate-200 text-slate-700 border-slate-300',
  },
};

export const DoctorQueueWidget: React.FC<DashboardWidgetProps> = () => {
  const ctx = useContext(OrganellaContext);
  const [queueList, setQueueList] = useState<OpdQueueItem[]>(FALLBACK_QUEUE);
  const [selectedQueueNo, setSelectedQueueNo] = useState<string>('A-014');
  const [loading, setLoading] = useState<boolean>(false);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/modules/doctor-opd/queue');
      if (res.ok) {
        const data: OpdQueueItem[] = await res.json();
        if (data && data.length > 0) {
          setQueueList(data);
        }
      }
    } catch {
      // Fallback to local queue when offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleSelectPatient = (item: OpdQueueItem) => {
    setSelectedQueueNo(item.queue_number);
    if (ctx?.emitEvent) {
      ctx.emitEvent('opd:queue-selected', item);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>คิวผู้ป่วยนอกวันนี้ ({queueList.length} ราย)</span>
        <button
          type="button"
          onClick={fetchQueue}
          className="text-teal-600 hover:text-teal-800 font-semibold flex items-center space-x-1"
        >
          <span>{loading ? 'กำลังโหลด...' : '↻ รีเฟรชคิว'}</span>
        </button>
      </div>

      <div className="space-y-2">
        {queueList.map((item) => {
          const badge = STATUS_BADGE[item.status] || {
            label: item.status,
            className: 'bg-slate-100 text-slate-600 border-slate-200',
          };
          const isSelected = selectedQueueNo === item.queue_number;

          return (
            <button
              key={item.encounter_number}
              type="button"
              onClick={() => handleSelectPatient(item)}
              className={`w-full text-left p-2.5 rounded-lg border transition-all text-xs ${
                isSelected
                  ? 'bg-teal-50/70 border-teal-400 ring-1 ring-teal-400/50 shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <span className="font-bold font-mono bg-teal-600 text-white px-1.5 py-0.5 rounded text-[11px]">
                    {item.queue_number}
                  </span>
                  <span className="text-slate-800 font-semibold">{item.patient_name}</span>
                </div>
                <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${badge.className}`}>
                  {badge.label}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                <span className="font-mono">{item.hn}</span>
                {item.allergies && item.allergies.length > 0 && (
                  <span className="text-red-600 font-medium">⚠️ แพ้ยา ({item.allergies.length})</span>
                )}
              </div>

              {item.chief_complaint && (
                <p className="text-[11px] text-slate-600 truncate mt-1 bg-white/80 px-2 py-1 rounded border border-slate-100">
                  CC: {item.chief_complaint}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DoctorQueueWidget;
