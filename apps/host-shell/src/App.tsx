import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  EncounterSummary,
  ModuleManifest,
  OrganellaContext,
  OrganellaContextValue,
  OrganellaUser,
  PatientDemographics,
} from '@organella/sdk';
import {
  toFHIRClinicalBundle,
  ClinicalConditionInput,
  ClinicalMedicationInput,
} from '@organella/fhir-helpers';
import { DynamicSlot } from './components/DynamicSlot';
import { resolveSlotComponents } from './services/slotRegistry';
import { SlotErrorBoundary } from './components/SlotErrorBoundary';

// Default patient synced with OPD Queue item #1
const initialPatient: PatientDemographics = {
  id: 'pat-0001',
  hn: 'HN-2026-0001',
  citizenId: '1100400239481',
  prefix: 'นาย',
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  gender: 'male',
  birthDate: '1978-05-14',
  allergies: ['Penicillin (ผื่นลมพิษเฉียบพลัน)', 'Aspirin (หลอดลมตีบ)'],
  bloodGroup: 'O+',
};

const initialEncounter: EncounterSummary & Record<string, any> = {
  id: 'ENC-2026-001',
  encounterNumber: 'ENC-2026-001',
  patientId: 'pat-0001',
  encounterType: 'OPD',
  status: 'in-progress',
  startTime: '2026-10-16T08:30:00Z',
  departmentId: 'อายุรกรรมทั่วไป (OPD Med Rm.3)',
  chiefComplaint: 'ไข้สูง เจ็บคอมาก กลืนลำบาก 2 วันก่อนมาโรงพยาบาล',
};

const initialConditions: ClinicalConditionInput[] = [
  {
    icd10Code: 'J02.9',
    icd10Display: 'Acute pharyngitis, unspecified (คออักเสบเฉียบพลัน)',
    diagnosisType: 'principal',
  },
  {
    icd10Code: 'I10',
    icd10Display: 'Essential (primary) hypertension (ความดันโลหิตสูงชนิดไม่ทราบสาเหตุ)',
    diagnosisType: 'comorbidity',
  },
];

const initialMedications: ClinicalMedicationInput[] = [
  {
    medicationCode: 'RX-PARA-500',
    medicationName: 'Paracetamol 500 mg Tablet',
    dosageInstruction: 'รับประทานครั้งละ 1 เม็ด ทุก 4-6 ชั่วโมง เวลาปวดหรือมีไข้',
    quantity: 20,
    unit: 'tablet',
  },
  {
    medicationCode: 'RX-ROXI-150',
    medicationName: 'Roxithromycin 150 mg Tablet (Safe for Penicillin Allergy)',
    dosageInstruction: 'รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง ก่อนอาหารเช้า-เย็น',
    quantity: 14,
    unit: 'tablet',
  },
];

const currentUser: OrganellaUser = {
  id: 'usr-102',
  username: 'dr.thanakorn',
  fullName: 'นพ. ธนากร วงศ์วิจิตร',
  licenseNumber: 'ว.45892',
  department: 'OPD-MED',
  roles: ['Doctor'],
  permissions: [
    'patient:read',
    'patient:write',
    'encounter:read',
    'encounter:write',
    'condition:write',
    'medication:write',
  ],
};

// Fallback manifest if backend API is not responding
const fallbackDoctorOpdManifest: ModuleManifest = {
  id: 'doctor-opd',
  name: 'Doctor OPD & Clinical Notes',
  version: '1.0.0',
  author: 'Organella Community',
  description: 'ระบบห้องตรวจแพทย์ บันทึก SOAP Note, วินิจฉัยโรค ICD-10 และสั่งการรักษา',
  permissions: ['patient:read', 'encounter:write', 'condition:write', 'medication:write'],
  frontend: {
    entry: 'http://localhost:5001/assets/remoteEntry.js',
    slots: [
      {
        slotId: 'patient-workspace-tab',
        title: 'ห้องตรวจแพทย์ (SOAP Notes)',
        component: './ConsultationTab',
      },
      {
        slotId: 'dashboard-widget',
        title: 'รายชื่อรอตรวจของแพทย์',
        component: './DoctorQueueWidget',
      },
    ],
  },
};

export function App() {
  const [patient, setPatient] = useState<PatientDemographics>(initialPatient);
  const [encounter, setEncounter] = useState<EncounterSummary & Record<string, any>>(
    initialEncounter
  );
  const [conditions, setConditions] = useState<ClinicalConditionInput[]>(initialConditions);
  const [medications, setMedications] = useState<ClinicalMedicationInput[]>(initialMedications);
  const [activeModules, setActiveModules] = useState<ModuleManifest[]>([fallbackDoctorOpdManifest]);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<string>('doctor-opd');
  const [events, setEvents] = useState<Array<{ name: string; time: string; data: any }>>([]);

  // Fetch active module manifests and initial OPD queue from Core API
  useEffect(() => {
    async function initShell() {
      try {
        const res = await fetch('http://localhost:8000/api/v1/modules/active-manifests');
        if (res.ok) {
          const data: ModuleManifest[] = await res.json();
          if (data && data.length > 0) {
            setActiveModules(data);
          }
        }
      } catch {
        // Fallback to initial local manifests
      }

      try {
        const qRes = await fetch('http://localhost:8000/api/v1/modules/doctor-opd/queue');
        if (qRes.ok) {
          const queue = await qRes.json();
          if (Array.isArray(queue) && queue.length > 0) {
            applyQueueItem(queue[0]);
          }
        }
      } catch {
        // Use initial patient state
      }
    }
    initShell();
  }, []);

  const applyQueueItem = (item: any) => {
    const parts = (item.patient_name || '').split(' ');
    const prefix = parts.length >= 3 ? parts[0] : 'คุณ';
    const firstName = parts.length >= 3 ? parts[1] : parts[0] || 'ผู้ป่วย';
    const lastName = parts.length >= 3 ? parts.slice(2).join(' ') : parts[1] || '';

    setPatient({
      id: item.patient_id,
      hn: item.hn,
      citizenId: '1-1004-00239-48-1',
      prefix,
      firstName,
      lastName,
      gender: item.gender || 'male',
      birthDate: item.birth_date || '1980-01-01',
      allergies: item.allergies || [],
      bloodGroup: item.blood_group || 'O+',
    });

    setEncounter({
      id: item.encounter_number || item.encounter_id,
      encounterNumber: item.encounter_number,
      patientId: item.patient_id,
      encounterType: 'OPD',
      status: item.status || 'in-progress',
      startTime: item.started_at || new Date().toISOString(),
      departmentId: item.department || 'OPD-MED',
      chiefComplaint: item.chief_complaint,
      vitalSigns: item.vital_signs,
      soapNote: item.soap_note,
      conditions: item.conditions,
      medications: item.medications,
    });

    if (Array.isArray(item.conditions)) {
      setConditions(
        item.conditions.map((c: any) => ({
          id: c.id,
          icd10Code: c.icd10_code,
          icd10Display: c.icd10_display,
          diagnosisType: c.diagnosis_type,
        }))
      );
    }

    if (Array.isArray(item.medications)) {
      setMedications(
        item.medications.map((m: any) => ({
          id: m.id,
          medicationCode: m.medication_code,
          medicationName: m.medication_name,
          dosageInstruction: m.dosage_instruction,
          quantity: m.quantity,
          unit: m.unit,
        }))
      );
    }
  };

  // Event dispatcher functions
  const emitEvent = useCallback((eventName: string, data: any) => {
    setEvents((prev) => [
      { name: eventName, time: new Date().toLocaleTimeString(), data },
      ...prev.slice(0, 5),
    ]);

    if (eventName === 'opd:queue-selected' && data) {
      applyQueueItem(data);
    }

    if (eventName === 'opd:consultation-saved' && data) {
      setEncounter((prev) => ({
        ...prev,
        id: data.encounterNumber || prev.id,
        status: 'finished',
        chiefComplaint: data.chiefComplaint,
      }));
      if (Array.isArray(data.conditions)) {
        setConditions(
          data.conditions.map((c: any) => ({
            icd10Code: c.icd10_code,
            icd10Display: c.icd10_display,
            diagnosisType: c.diagnosis_type,
          }))
        );
      }
      if (Array.isArray(data.medications)) {
        setMedications(
          data.medications.map((m: any) => ({
            medicationCode: m.medication_code,
            medicationName: m.medication_name,
            dosageInstruction: m.dosage_instruction,
            quantity: m.quantity,
            unit: m.unit,
          }))
        );
      }
    }
  }, []);

  const onEvent = useCallback((_eventName: string, _handler: (data: any) => void) => {
    return () => {};
  }, []);

  const contextValue: OrganellaContextValue = useMemo(
    () => ({
      patient,
      activeEncounter: encounter,
      user: currentUser,
      activeModules,
      activeWorkspaceTab,
      setActiveWorkspaceTab,
      emitEvent,
      onEvent,
    }),
    [patient, encounter, activeModules, activeWorkspaceTab, emitEvent, onEvent]
  );

  const fhirBundle = useMemo(
    () =>
      toFHIRClinicalBundle({
        patient,
        encounter: {
          id: encounter.id,
          encounterNumber: encounter.encounterNumber || encounter.id,
          patientId: patient.id,
          status: encounter.status,
          department: encounter.departmentId || 'OPD-MED',
          chiefComplaint: encounter.chiefComplaint,
          startedAt: encounter.startTime,
        },
        conditions,
        medications,
      }),
    [patient, encounter, conditions, medications]
  );

  // Available Workspace Tabs from all active modules declaring patient-workspace-tab
  const workspaceTabs = resolveSlotComponents('patient-workspace-tab', activeModules);

  return (
    <OrganellaContext.Provider value={contextValue}>
      <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm sticky top-0 z-50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              🧬
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Organella</h1>
                <span className="text-[10px] font-semibold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-200">
                  Clinical OPD & HL7 FHIR R4 (Phase 3)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Generic Health Engine • Dynamic Slot Registry • Real-time FHIR R4 Bundle
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-800">{currentUser.fullName}</p>
              <p className="text-xs text-slate-500">
                {currentUser.department} | เลข ว.{currentUser.licenseNumber}
              </p>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center font-bold text-slate-600">
              DR
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* Active Patient Context Banner */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-3 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-900">
                    {patient.prefix} {patient.firstName} {patient.lastName}
                  </h2>
                  <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-mono font-medium">
                    HN: {patient.hn}
                  </span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-medium">
                    เพศ: {patient.gender === 'male' ? 'ชาย' : 'หญิง'}
                  </span>
                  <span className="text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded font-medium">
                    กรุ๊ปเลือด: {patient.bloodGroup}
                  </span>
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded font-mono font-semibold border border-emerald-200">
                    Visit: {encounter.id} ({encounter.status})
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  เลขบัตรประชาชน: {patient.citizenId} | วันเกิด: {patient.birthDate} | แผนก:{' '}
                  {encounter.departmentId}
                </p>
              </div>

              {/* Dynamic Banner Actions Slot */}
              <div className="flex items-center space-x-2">
                <DynamicSlot slotId="patient-banner-action" />
              </div>
            </div>

            {patient.allergies && patient.allergies.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center space-x-2">
                <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                  ⚠️ ประวัติแพ้ยาสำคัญ:
                </span>
                <span className="text-xs text-red-700 font-semibold">
                  {patient.allergies.join(', ')}
                </span>
              </div>
            )}
          </section>

          {/* Main Grid: Workspace & Sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Clinical Workspace Extension Slot */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Dynamic Tab Bar populated by active modules */}
                <div className="border-b border-slate-200 px-4 pt-3 flex items-center space-x-2 bg-slate-50">
                  {workspaceTabs.map((tab) => (
                    <button
                      key={tab.moduleId}
                      onClick={() => setActiveWorkspaceTab(tab.moduleId)}
                      className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-t border-x -mb-[1px] ${
                        activeWorkspaceTab === tab.moduleId
                          ? 'bg-white border-slate-200 text-teal-700 shadow-sm'
                          : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {tab.title}
                    </button>
                  ))}
                  {workspaceTabs.length === 0 && (
                    <span className="text-xs text-slate-400 py-2">
                      ไม่มีโมดูลเวิร์กสเปซที่เปิดใช้งาน
                    </span>
                  )}
                </div>

                {/* Tab Content Dynamic Mount */}
                <div className="p-5">
                  {workspaceTabs.map((tab) => {
                    if (activeWorkspaceTab !== tab.moduleId) return null;
                    const Component = tab.Component;
                    return (
                      <SlotErrorBoundary
                        key={tab.moduleId}
                        slotId="patient-workspace-tab"
                        moduleId={tab.moduleId}
                      >
                        <Component
                          patient={patient}
                          activeEncounter={encounter}
                          user={currentUser}
                          moduleId={tab.moduleId}
                        />
                      </SlotErrorBoundary>
                    );
                  })}
                </div>
              </div>

              {/* Event Bus Log Window */}
              {events.length > 0 && (
                <div className="bg-slate-900 text-slate-200 p-4 rounded-xl shadow-sm text-xs font-mono">
                  <p className="text-teal-400 font-bold mb-1">
                    📡 Client-Side & Redis Event Bus Activity:
                  </p>
                  <ul className="space-y-1">
                    {events.map((e, i) => (
                      <li key={i} className="truncate">
                        <span className="text-slate-400">[{e.time}]</span>{' '}
                        <span className="text-amber-400 font-semibold">{e.name}:</span>{' '}
                        {JSON.stringify(e.data)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Right Col: Dashboard Widgets & Live Standards Preview */}
            <div className="space-y-6">
              {/* Dashboard Widgets Slot */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="border-b border-slate-100 pb-2 mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-sm">คิวรอตรวจ (คลิกเพื่อสลับผู้ป่วย)</h3>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">
                    slot: dashboard-widget
                  </span>
                </div>
                <DynamicSlot slotId="dashboard-widget" />
              </div>

              {/* HL7 FHIR Live Interoperability Output */}
              <div className="bg-slate-900 text-slate-200 rounded-xl p-5 shadow-sm font-mono text-xs overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-teal-400 font-bold">⚡ HL7 FHIR R4 Clinical Bundle</p>
                    <p className="text-[10px] text-slate-400">
                      Patient + Encounter + {conditions.length} Condition + {medications.length}{' '}
                      MedicationRequest
                    </p>
                  </div>
                  <span className="text-[10px] bg-teal-900/50 text-teal-300 px-2 py-0.5 rounded border border-teal-700">
                    $everything
                  </span>
                </div>
                <pre className="text-slate-300 max-h-80 overflow-y-auto text-[11px]">
                  {JSON.stringify(fhirBundle, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </main>
      </div>
    </OrganellaContext.Provider>
  );
}

export default App;
