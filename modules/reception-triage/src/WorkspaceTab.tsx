import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  checkRequiredPermissions,
  OrganellaContext,
  PatientTabProps,
} from '@organella/sdk';

export const REQUIRED_VIEW_QUEUE_ROLES = ['patient:read'];
export const REQUIRED_CHECKIN_ROLES = ['patient:read', 'queue:manage'];
export const REQUIRED_TRIAGE_ROLES = ['patient:read', 'triage:write'];

interface QueueEntry {
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
  vital_signs: {
    bp_systolic?: number;
    bp_diastolic?: number;
    pulse?: number;
    temperature?: number;
    respiratory_rate?: number;
    spo2?: number;
    weight?: number;
    height?: number;
    bmi?: number;
    pain_score?: number;
  };
}

interface MpiPatientRecord {
  id: string;
  hn: string;
  citizen_id?: string;
  prefix?: string;
  first_name: string;
  last_name: string;
  gender: string;
  birth_date: string;
  blood_group?: string;
  allergies: string[];
}

const CLINIC_DEPARTMENTS = [
  'อายุรกรรมทั่วไป (OPD Med Rm.3)',
  'คลินิกโรคเรื้อรัง NCD (OPD Med Rm.3)',
  'ศัลยกรรมทั่วไป (OPD Surg Rm.1)',
  'ฉุกเฉินและคัดกรองด่วน (ER / Acute Care)',
];

export const WorkspaceTab: React.FC<PatientTabProps> = ({
  patient,
  activeEncounter,
  user,
  readonly,
}) => {
  const ctx = useContext(OrganellaContext);
  const effectiveUser = user || ctx?.user;
  const authToken = ctx?.authToken;

  const viewCheck = useMemo(
    () => checkRequiredPermissions(effectiveUser?.permissions, REQUIRED_VIEW_QUEUE_ROLES),
    [effectiveUser?.permissions]
  );
  const checkinCheck = useMemo(
    () => checkRequiredPermissions(effectiveUser?.permissions, REQUIRED_CHECKIN_ROLES),
    [effectiveUser?.permissions]
  );
  const triageCheck = useMemo(
    () => checkRequiredPermissions(effectiveUser?.permissions, REQUIRED_TRIAGE_ROLES),
    [effectiveUser?.permissions]
  );

  const canCheckIn = !readonly && checkinCheck.allowed;
  const canTriage = !readonly && triageCheck.allowed;

  const [subTab, setSubTab] = useState<'board' | 'checkin' | 'triage'>('board');
  const [queueList, setQueueList] = useState<QueueEntry[]>([]);
  const [mpiPatients, setMpiPatients] = useState<MpiPatientRecord[]>([]);
  const [loadingQueue, setLoadingQueue] = useState<boolean>(false);

  // Selected queue item for Nursing Triage
  const [selectedQueueNumber, setSelectedQueueNumber] = useState<string>('');

  // Check-in form state
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patient.id || '');
  const [checkinDepartment, setCheckinDepartment] = useState<string>(CLINIC_DEPARTMENTS[0]);
  const [checkinPriority, setCheckinPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [checkinComplaint, setCheckinComplaint] = useState<string>(
    'มาตรวจตามนัด / ขอพบแพทย์ตรวจอาการทั่วไป'
  );
  const [checkingIn, setCheckingIn] = useState<boolean>(false);

  const patientFullName = `${patient.prefix ? patient.prefix + ' ' : ''}${patient.firstName} ${patient.lastName}`.trim();

  // Triage form state
  const [triageEncounterNumber, setTriageEncounterNumber] = useState<string>(
    (activeEncounter as any)?.encounterNumber || 'ENC-2026-002'
  );
  const [triagePatientId, setTriagePatientId] = useState<string>(patient.id);
  const [triagePatientName, setTriagePatientName] = useState<string>(patientFullName);
  const [triagePatientHn, setTriagePatientHn] = useState<string>(patient.hn);
  const [triagePriority, setTriagePriority] = useState<string>('routine');
  const [triageDepartment, setTriageDepartment] = useState<string>(CLINIC_DEPARTMENTS[0]);
  const [triageComplaint, setTriageComplaint] = useState<string>(
    (activeEncounter as any)?.chiefComplaint || 'จุกแสบลิ้นปี่ เรอเปรี้ยว หลังอาหารมื้อเย็น'
  );
  const [allergyInput, setAllergyInput] = useState<string>(
    (patient.allergies || []).join(', ')
  );

  // Vital Signs state
  const [bpSys, setBpSys] = useState<number>(122);
  const [bpDia, setBpDia] = useState<number>(78);
  const [pulse, setPulse] = useState<number>(76);
  const [temp, setTemp] = useState<number>(36.7);
  const [respRate, setRespRate] = useState<number>(18);
  const [spo2, setSpo2] = useState<number>(99);
  const [weight, setWeight] = useState<number>(64.0);
  const [height, setHeight] = useState<number>(166.0);
  const [painScore, setPainScore] = useState<number>(0);
  const [savingTriage, setSavingTriage] = useState<boolean>(false);

  const [banner, setBanner] = useState<{
    type: 'success' | 'error';
    message: string;
    missingRoles?: string[];
  } | null>(null);

  const calculatedBmi = useMemo(() => {
    if (!weight || !height || weight <= 0 || height <= 0) return 0;
    const hMeters = height / 100;
    return Number((weight / (hMeters * hMeters)).toFixed(1));
  }, [weight, height]);

  const bmiCategory = useMemo(() => {
    if (!calculatedBmi) return { label: '-', color: 'bg-slate-100 text-slate-600' };
    if (calculatedBmi < 18.5)
      return { label: 'น้ำหนักน้อย (Underweight)', color: 'bg-sky-100 text-sky-800' };
    if (calculatedBmi < 23.0)
      return { label: 'สมส่วน (Normal Asian BMI)', color: 'bg-emerald-100 text-emerald-800' };
    if (calculatedBmi < 25.0)
      return { label: 'น้ำหนักเกิน (Overweight)', color: 'bg-amber-100 text-amber-800' };
    if (calculatedBmi < 30.0)
      return { label: 'อ้วนระดับ 1 (Obese Class I)', color: 'bg-orange-100 text-orange-800' };
    return { label: 'อ้วนระดับ 2 (Obese Class II)', color: 'bg-red-100 text-red-800' };
  }, [calculatedBmi]);

  const fetchQueueAndPatients = async () => {
    setLoadingQueue(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const [qRes, pRes] = await Promise.all([
        fetch('http://localhost:8000/api/v1/modules/doctor-opd/queue', { headers }),
        fetch('http://localhost:8000/api/v1/patients', { headers }),
      ]);

      if (qRes.ok) {
        const qData: QueueEntry[] = await qRes.json();
        setQueueList(qData);
        const matched =
          qData.find((item) => item.patient_id === patient.id || item.hn === patient.hn) ||
          qData[0];
        if (matched && !selectedQueueNumber) {
          populateTriageFromQueueItem(matched);
        }
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        const items: MpiPatientRecord[] = Array.isArray(pData) ? pData : pData.items || [];
        setMpiPatients(items);
        if (!selectedPatientId && items.length > 0) {
          setSelectedPatientId(items[0].id);
        }
      }
    } catch {
      // Fallback gracefully when running standalone preview
    } finally {
      setLoadingQueue(false);
    }
  };

  const populateTriageFromQueueItem = (item: QueueEntry) => {
    setSelectedQueueNumber(item.queue_number);
    setTriageEncounterNumber(item.encounter_number);
    setTriagePatientId(item.patient_id);
    setTriagePatientName(item.patient_name);
    setTriagePatientHn(item.hn);
    setTriagePriority(item.priority || 'routine');
    setTriageDepartment(item.department || CLINIC_DEPARTMENTS[0]);
    setTriageComplaint(item.chief_complaint || '');
    setAllergyInput((item.allergies || []).join(', '));
    const vs = item.vital_signs || {};
    setBpSys(vs.bp_systolic ?? 120);
    setBpDia(vs.bp_diastolic ?? 80);
    setPulse(vs.pulse ?? 76);
    setTemp(vs.temperature ?? 36.6);
    setRespRate(vs.respiratory_rate ?? 18);
    setSpo2(vs.spo2 ?? 99);
    setWeight(vs.weight ?? 60.0);
    setHeight(vs.height ?? 165.0);
    setPainScore(vs.pain_score ?? 0);
  };

  useEffect(() => {
    fetchQueueAndPatients();
  }, [patient.id]);

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkinCheck.allowed) {
      setBanner({
        type: 'error',
        message: checkinCheck.errorMessage || 'ไม่มีสิทธิ์ออกคิวผู้ป่วยนอก',
        missingRoles: checkinCheck.missingRoles,
      });
      return;
    }

    setCheckingIn(true);
    setBanner(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('http://localhost:8000/api/v1/modules/doctor-opd/checkin', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patient_id: selectedPatientId || patient.id,
          department: checkinDepartment,
          priority: checkinPriority,
          chief_complaint: checkinComplaint,
        }),
      });

      if (res.ok) {
        const createdQueue: QueueEntry = await res.json();
        setQueueList((prev) => [...prev, createdQueue]);
        populateTriageFromQueueItem(createdQueue);
        setBanner({
          type: 'success',
          message: `ออกหมายเลขคิว ${createdQueue.queue_number} (${createdQueue.encounter_number}) สำหรับ ${createdQueue.patient_name} สำเร็จ! ส่งต่อไปยังจุดคัดกรองพยาบาลแล้ว`,
        });
        setSubTab('board');
        if (ctx?.emitEvent) {
          ctx.emitEvent('reception:patient-checked-in', {
            queueNumber: createdQueue.queue_number,
            encounterNumber: createdQueue.encounter_number,
            patientHn: createdQueue.hn,
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        setBanner({
          type: 'error',
          message: typeof detail === 'object' ? detail.message : detail || 'ไม่สามารถออกคิวได้',
          missingRoles: typeof detail === 'object' ? detail.missing_roles : undefined,
        });
      }
    } catch {
      setBanner({
        type: 'error',
        message: 'ไม่สามารถเชื่อมต่อ Core API ที่พอร์ต 8000 ได้',
      });
    } finally {
      setCheckingIn(false);
    }
  };

  const handleSaveTriage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triageCheck.allowed) {
      setBanner({
        type: 'error',
        message: triageCheck.errorMessage || 'ไม่มีสิทธิ์บันทึกข้อมูลคัดกรองและสัญญาณชีพ',
        missingRoles: triageCheck.missingRoles,
      });
      return;
    }

    setSavingTriage(true);
    setBanner(null);

    const parsedAllergies = allergyInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('http://localhost:8000/api/v1/modules/doctor-opd/triage', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          encounter_number: triageEncounterNumber,
          patient_id: triagePatientId,
          chief_complaint: triageComplaint,
          priority: triagePriority,
          department: triageDepartment,
          allergies: parsedAllergies,
          vital_signs: {
            bp_systolic: Number(bpSys),
            bp_diastolic: Number(bpDia),
            pulse: Number(pulse),
            temperature: Number(temp),
            respiratory_rate: Number(respRate),
            spo2: Number(spo2),
            weight: Number(weight),
            height: Number(height),
            bmi: calculatedBmi,
            pain_score: Number(painScore),
          },
        }),
      });

      if (res.ok) {
        const updatedEnc = await res.json();
        await fetchQueueAndPatients();
        setBanner({
          type: 'success',
          message: `บันทึกสัญญาณชีพและการคัดกรอง (${updatedEnc.encounter_number} • BMI ${calculatedBmi} kg/m²) สำเร็จ! สถานะคิวเปลี่ยนเป็น 'คัดกรองแล้ว รอพบแพทย์ (triaged)'`,
        });
        if (ctx?.emitEvent) {
          ctx.emitEvent('triage:completed', {
            encounterNumber: updatedEnc.encounter_number,
            patientId: triagePatientId,
            bmi: calculatedBmi,
            priority: triagePriority,
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        setBanner({
          type: 'error',
          message:
            typeof detail === 'object' ? detail.message : detail || 'ไม่สามารถบันทึกผลคัดกรองได้',
          missingRoles: typeof detail === 'object' ? detail.missing_roles : undefined,
        });
      }
    } catch {
      setBanner({
        type: 'error',
        message: 'ไม่สามารถเชื่อมต่อ Core API ที่พอร์ต 8000 ได้',
      });
    } finally {
      setSavingTriage(false);
    }
  };

  const handleStatusChange = async (encNumber: string, newStatus: string) => {
    if (!checkinCheck.allowed) {
      setBanner({
        type: 'error',
        message: checkinCheck.errorMessage || 'ไม่มีสิทธิ์เปลี่ยนสถานะคิว',
        missingRoles: checkinCheck.missingRoles,
      });
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(
        `http://localhost:8000/api/v1/modules/doctor-opd/encounters/${encNumber}/status`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (res.ok) {
        await fetchQueueAndPatients();
        setBanner({
          type: 'success',
          message: `อัปเดตสถานะคิว ${encNumber} เป็น '${newStatus}' เรียบร้อยแล้ว`,
        });
      }
    } catch {
      // Ignore error in preview
    }
  };

  if (!viewCheck.allowed) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-900">
        <h3 className="text-base font-bold">
          ⛔ ปฏิเสธการเข้าถึง (Role-List Permission Guard)
        </h3>
        <p className="text-sm mt-1">{viewCheck.errorMessage}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {viewCheck.missingRoles.map((r) => (
            <span
              key={r}
              className="px-2.5 py-0.5 bg-red-100 border border-red-300 text-red-800 rounded font-mono text-xs font-semibold"
            >
              ขาดสิทธิ์: {r}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const stageCounts = {
    arrived: queueList.filter((q) => q.status === 'arrived').length,
    triaged: queueList.filter((q) => q.status === 'triaged').length,
    inProgress: queueList.filter((q) => q.status === 'in-progress').length,
    finished: queueList.filter((q) => q.status === 'finished').length,
  };

  return (
    <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-cyan-100 text-cyan-800 rounded-full">
              @organella-module/reception-triage
            </span>
            <span className="text-xs text-slate-400 font-mono">Port 5003 • Phase 5</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            🏥 เวชระเบียน ออกคิวผู้ป่วยนอก และจุดคัดกรองสัญญาณชีพ (Reception, Queue & Nursing Triage)
          </h2>
          <p className="text-sm text-slate-500">
            กำลังใช้งานสำหรับผู้ป่วย:{' '}
            <strong className="text-slate-800">{patientFullName}</strong> ({patient.hn})
          </p>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('board')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              subTab === 'board'
                ? 'bg-white text-cyan-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 กระดานคิว ({queueList.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('checkin')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              subTab === 'checkin'
                ? 'bg-white text-cyan-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ➕ ออกคิวส่งตรวจใหม่ (Check-In)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('triage')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              subTab === 'triage'
                ? 'bg-white text-cyan-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🩺 คัดกรองและวัดสัญญาณชีพ (Triage)
          </button>
        </div>
      </div>

      {/* Role-List Permission Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div
          className={`p-3 rounded-lg border flex items-center justify-between ${
            canCheckIn
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/70 border-amber-200 text-amber-900'
          }`}
        >
          <div>
            <span className="font-bold">สิทธิ์เวชระเบียนและออกคิว (Reception Queue):</span>{' '}
            <span className="font-mono">[{REQUIRED_CHECKIN_ROLES.join(', ')}]</span>
          </div>
          {canCheckIn ? (
            <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-900 rounded font-bold">
              ✓ อนุญาต
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded font-mono">
              ขาดสิทธิ์: {checkinCheck.missingRoles.join(', ') || 'Read-only'}
            </span>
          )}
        </div>

        <div
          className={`p-3 rounded-lg border flex items-center justify-between ${
            canTriage
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/70 border-amber-200 text-amber-900'
          }`}
        >
          <div>
            <span className="font-bold">สิทธิ์พยาบาลคัดกรอง (Nursing Triage):</span>{' '}
            <span className="font-mono">[{REQUIRED_TRIAGE_ROLES.join(', ')}]</span>
          </div>
          {canTriage ? (
            <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-900 rounded font-bold">
              ✓ อนุญาต
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded font-mono">
              ขาดสิทธิ์: {triageCheck.missingRoles.join(', ') || 'Read-only'}
            </span>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`p-4 rounded-xl border ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <div className="font-bold text-sm">{banner.message}</div>
          {banner.missingRoles && banner.missingRoles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {banner.missingRoles.map((r) => (
                <span
                  key={r}
                  className="px-2 py-0.5 bg-red-100 border border-red-300 text-red-800 rounded font-mono text-xs font-semibold"
                >
                  ขาดสิทธิ์: {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 1: END-TO-END QUEUE BOARD */}
      {subTab === 'board' && (
        <div className="space-y-4">
          {/* Pipeline Stage Counters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-xs font-bold text-amber-700 uppercase">
                1. รอคัดกรอง (Arrived)
              </div>
              <div className="text-2xl font-extrabold text-amber-900 mt-1">
                {stageCounts.arrived} <span className="text-xs font-normal">คิว</span>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-cyan-50 border border-cyan-200">
              <div className="text-xs font-bold text-cyan-700 uppercase">
                2. คัดกรองแล้ว รอพบแพทย์ (Triaged)
              </div>
              <div className="text-2xl font-extrabold text-cyan-900 mt-1">
                {stageCounts.triaged} <span className="text-xs font-normal">คิว</span>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200">
              <div className="text-xs font-bold text-indigo-700 uppercase">
                3. กำลังตรวจรักษา (In Consultation)
              </div>
              <div className="text-2xl font-extrabold text-indigo-900 mt-1">
                {stageCounts.inProgress} <span className="text-xs font-normal">คิว</span>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-xs font-bold text-emerald-700 uppercase">
                4. ตรวจเสร็จ / รอรับยา (Finished)
              </div>
              <div className="text-2xl font-extrabold text-emerald-900 mt-1">
                {stageCounts.finished} <span className="text-xs font-normal">คิว</span>
              </div>
            </div>
          </div>

          {/* Queue Cards List */}
          <div className="space-y-2.5">
            {loadingQueue ? (
              <div className="p-6 text-center text-sm text-slate-500">
                กำลังโหลดรายการคิวผู้ป่วยนอก...
              </div>
            ) : (
              queueList.map((item) => {
                const vs = item.vital_signs || {};
                const bmiVal =
                  vs.bmi ||
                  (vs.weight && vs.height
                    ? Number((vs.weight / Math.pow(vs.height / 100, 2)).toFixed(1))
                    : null);
                return (
                  <div
                    key={item.encounter_number}
                    className="p-4 rounded-xl border border-slate-200 hover:border-cyan-300 bg-slate-50/60 flex flex-wrap items-center justify-between gap-4 transition-all"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`px-3 py-2 rounded-xl font-mono font-extrabold text-base text-center min-w-[76px] ${
                          item.priority === 'stat'
                            ? 'bg-red-600 text-white'
                            : item.priority === 'urgent'
                            ? 'bg-amber-500 text-white'
                            : 'bg-cyan-700 text-white'
                        }`}
                      >
                        {item.queue_number}
                        <div className="text-[10px] font-semibold uppercase opacity-90">
                          {item.priority}
                        </div>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {item.patient_name}
                          </span>
                          <span className="text-xs font-mono text-slate-500">({item.hn})</span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-200 text-slate-700">
                            {item.encounter_number}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              item.status === 'arrived'
                                ? 'bg-amber-100 text-amber-800'
                                : item.status === 'triaged'
                                ? 'bg-cyan-100 text-cyan-800'
                                : item.status === 'in-progress'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {item.status === 'arrived'
                              ? '1. รอคัดกรอง (Arrived)'
                              : item.status === 'triaged'
                              ? '2. คัดกรองแล้ว รอพบแพทย์ (Triaged)'
                              : item.status === 'in-progress'
                              ? '3. กำลังตรวจ (In-Progress)'
                              : '4. เสร็จสิ้น (Finished)'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          <span className="font-semibold text-slate-700">{item.department}</span> •
                          อาการสำคัญ: {item.chief_complaint || '-'}
                        </div>
                        {/* Vital Signs Mini Badges */}
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-mono">
                          {vs.bp_systolic && (
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                              BP: {vs.bp_systolic}/{vs.bp_diastolic} mmHg
                            </span>
                          )}
                          {vs.temperature && (
                            <span
                              className={`px-2 py-0.5 rounded border ${
                                vs.temperature >= 37.8
                                  ? 'bg-red-50 border-red-200 text-red-700 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              Temp: {vs.temperature} °C
                            </span>
                          )}
                          {vs.pulse && (
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                              HR: {vs.pulse} bpm
                            </span>
                          )}
                          {bmiVal && (
                            <span className="px-2 py-0.5 rounded bg-cyan-50 border border-cyan-200 text-cyan-800 font-bold">
                              BMI: {bmiVal} kg/m²
                            </span>
                          )}
                          {item.allergies && item.allergies.length > 0 && (
                            <span className="px-2 py-0.5 rounded bg-red-100 border border-red-300 text-red-800 font-sans font-bold">
                              ⚠️ แพ้ยา: {item.allergies.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          populateTriageFromQueueItem(item);
                          setSubTab('triage');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold shadow-sm transition-colors"
                      >
                        🩺 คัดกรอง / วัดสัญญาณชีพ
                      </button>
                      {canCheckIn && item.status === 'arrived' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(item.encounter_number, 'triaged')}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                        >
                          ส่งห้องตรวจ ➔
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: PATIENT CHECK-IN & NEW QUEUE ISSUANCE */}
      {subTab === 'checkin' && (
        <form onSubmit={handleCheckInSubmit} className="space-y-4 max-w-2xl">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">
              ➕ ออกหมายเลขคิวผู้ป่วยนอกใหม่ (Reception OPD Queue Check-In)
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                เลือกผู้ป่วยจากทะเบียนกลาง (MPI Patient)
              </label>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {mpiPatients.length > 0 ? (
                  mpiPatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.hn} — {p.prefix || ''}
                      {p.first_name} {p.last_name} (เกิด: {p.birth_date})
                    </option>
                  ))
                ) : (
                  <option value={patient.id}>
                    {patient.hn} — {patientFullName}
                  </option>
                )}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  แผนกคลินิกที่ส่งตรวจ (Target Clinic Department)
                </label>
                <select
                  value={checkinDepartment}
                  onChange={(e) => setCheckinDepartment(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {CLINIC_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ระดับความเร่งด่วน (Queue Priority)
                </label>
                <select
                  value={checkinPriority}
                  onChange={(e) =>
                    setCheckinPriority(e.target.value as 'routine' | 'urgent' | 'stat')
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="routine">Routine (คิวปกติ — หมวด A)</option>
                  <option value="urgent">Urgent (คิวด่วน — หมวด U)</option>
                  <option value="stat">STAT / Emergency (คิววิกฤตฉุกเฉิน — หมวด S)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                อาการเบื้องต้น / เหตุผลที่มาโรงพยาบาล (Initial Visit Reason)
              </label>
              <textarea
                rows={2}
                value={checkinComplaint}
                onChange={(e) => setCheckinComplaint(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="ระบุอาการเบื้องต้นหรือความต้องการของผู้ป่วย..."
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={checkingIn || !canCheckIn}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all ${
                  canCheckIn
                    ? 'bg-cyan-600 hover:bg-cyan-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                {checkingIn ? 'กำลังออกหมายเลขคิว...' : '🎫 ออกบัตรคิวและส่งจุดคัดกรองพยาบาล'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* SUB-TAB 3: NURSING TRIAGE & VITAL SIGNS STATION */}
      {subTab === 'triage' && (
        <form onSubmit={handleSaveTriage} className="space-y-4">
          <div className="p-4 rounded-xl bg-cyan-50/60 border border-cyan-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-cyan-800 uppercase">
                กำลังบันทึกข้อมูลคัดกรองสำหรับคิวตรวจ
              </div>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">
                {selectedQueueNumber || 'A-015'} • {triagePatientName} ({triagePatientHn}) —{' '}
                <span className="font-mono text-sm text-cyan-700">{triageEncounterNumber}</span>
              </div>
            </div>

            {/* Select another queue item directly */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">สลับคิว:</label>
              <select
                value={triageEncounterNumber}
                onChange={(e) => {
                  const found = queueList.find((q) => q.encounter_number === e.target.value);
                  if (found) populateTriageFromQueueItem(found);
                }}
                className="rounded-lg border border-cyan-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
              >
                {queueList.map((q) => (
                  <option key={q.encounter_number} value={q.encounter_number}>
                    [{q.queue_number}] {q.patient_name} ({q.encounter_number})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Vital Signs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <label className="block text-[11px] font-bold text-slate-600">
                ความดันตัวบน Systolic (mmHg)
              </label>
              <input
                type="number"
                value={bpSys}
                onChange={(e) => setBpSys(Number(e.target.value))}
                disabled={!canTriage}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono font-bold bg-white"
              />
              {bpSys >= 140 && (
                <span className="inline-block mt-1 text-[10px] font-bold text-red-600">
                  ⚠️ สูงกว่าเกณฑ์ (≥140)
                </span>
              )}
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <label className="block text-[11px] font-bold text-slate-600">
                ความดันตัวล่าง Diastolic (mmHg)
              </label>
              <input
                type="number"
                value={bpDia}
                onChange={(e) => setBpDia(Number(e.target.value))}
                disabled={!canTriage}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono font-bold bg-white"
              />
              {bpDia >= 90 && (
                <span className="inline-block mt-1 text-[10px] font-bold text-red-600">
                  ⚠️ สูงกว่าเกณฑ์ (≥90)
                </span>
              )}
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <label className="block text-[11px] font-bold text-slate-600">
                ชีพจร Heart Rate (bpm)
              </label>
              <input
                type="number"
                value={pulse}
                onChange={(e) => setPulse(Number(e.target.value))}
                disabled={!canTriage}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono font-bold bg-white"
              />
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <label className="block text-[11px] font-bold text-slate-600">
                อุณหภูมิร่างกาย Temp (°C)
              </label>
              <input
                type="number"
                step="0.1"
                value={temp}
                onChange={(e) => setTemp(Number(e.target.value))}
                disabled={!canTriage}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono font-bold bg-white"
              />
              {temp >= 37.8 && (
                <span className="inline-block mt-1 text-[10px] font-bold text-red-600">
                  🔥 มีไข้ (Fever ≥37.8°C)
                </span>
              )}
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <label className="block text-[11px] font-bold text-slate-600">
                อัตราการหายใจ RR (/min)
              </label>
              <input
                type="number"
                value={respRate}
                onChange={(e) => setRespRate(Number(e.target.value))}
                disabled={!canTriage}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono font-bold bg-white"
              />
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <label className="block text-[11px] font-bold text-slate-600">
                ออกซิเจนปลายนิ้ว SpO2 (%)
              </label>
              <input
                type="number"
                value={spo2}
                onChange={(e) => setSpo2(Number(e.target.value))}
                disabled={!canTriage}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono font-bold bg-white"
              />
              {spo2 < 95 && (
                <span className="inline-block mt-1 text-[10px] font-bold text-red-600">
                  🚨 ออกซิเจนต่ำ (&lt;95%)
                </span>
              )}
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <label className="block text-[11px] font-bold text-slate-600">
                น้ำหนักตัว Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                disabled={!canTriage}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono font-bold bg-white"
              />
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <label className="block text-[11px] font-bold text-slate-600">
                ส่วนสูง Height (cm)
              </label>
              <input
                type="number"
                step="0.1"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                disabled={!canTriage}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono font-bold bg-white"
              />
            </div>
          </div>

          {/* Real-time BMI & Pain Score Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500">
                  ดัชนีมวลกายคำนวณอัตโนมัติ (Auto-Calculated BMI)
                </div>
                <div className="text-xl font-extrabold text-slate-900 font-mono mt-0.5">
                  {calculatedBmi} <span className="text-xs font-normal">kg/m²</span>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${bmiCategory.color}`}>
                {bmiCategory.label}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>ระดับความปวด (Pain Score 0–10)</span>
                  <span className="font-mono text-cyan-700">{painScore} / 10</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={painScore}
                  onChange={(e) => setPainScore(Number(e.target.value))}
                  disabled={!canTriage}
                  className="w-full accent-cyan-600"
                />
              </div>
            </div>
          </div>

          {/* Chief Complaint, Priority & Drug Allergy Screening */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                อาการสำคัญแรกรับ (Chief Complaint — CC)
              </label>
              <textarea
                rows={2}
                value={triageComplaint}
                onChange={(e) => setTriageComplaint(e.target.value)}
                disabled={!canTriage}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-red-700 mb-1">
                ⚠️ ซักประวัติการแพ้ยา/อาหาร (Drug Allergy Screening — คั่นด้วยจุลภาค ,)
              </label>
              <textarea
                rows={2}
                value={allergyInput}
                onChange={(e) => setAllergyInput(e.target.value)}
                disabled={!canTriage}
                placeholder="เช่น Penicillin (ผื่นลมพิษ), Aspirin (หอบเหนื่อย) — เว้นว่างหากปฏิเสธแพ้ยา"
                className="w-full rounded-lg border border-red-200 bg-red-50/30 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700">ระดับความเร่งด่วนหลังคัดกรอง:</label>
              <select
                value={triagePriority}
                onChange={(e) => setTriagePriority(e.target.value)}
                disabled={!canTriage}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold bg-white"
              >
                <option value="routine">Routine (ปกติ)</option>
                <option value="urgent">Urgent (เร่งด่วน)</option>
                <option value="stat">STAT (ฉุกเฉินวิกฤต)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={savingTriage || !canTriage}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all ${
                canTriage
                  ? 'bg-cyan-600 hover:bg-cyan-700 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              {savingTriage
                ? 'กำลังบันทึกข้อมูลคัดกรอง...'
                : '✅ บันทึกสัญญาณชีพและส่งคิวเข้าห้องตรวจแพทย์ (Save Triage)'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default WorkspaceTab;
