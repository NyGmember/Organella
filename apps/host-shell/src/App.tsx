import { useEffect, useState, useMemo } from 'react';
import {
  EncounterSummary,
  ModuleManifest,
  OrganellaContext,
  OrganellaContextValue,
  OrganellaUser,
  PatientDemographics,
} from '@organella/sdk';
import { toFHIRPatient } from '@organella/fhir-helpers';
import { DynamicSlot } from './components/DynamicSlot';
import { resolveSlotComponents } from './services/slotRegistry';
import { SlotErrorBoundary } from './components/SlotErrorBoundary';

// Default mock patient
const initialPatient: PatientDemographics = {
  id: 'pat-0001',
  hn: '670001',
  citizenId: '1-1002-00345-67-8',
  prefix: 'นาย',
  firstName: 'สมศักดิ์',
  lastName: 'มั่นคง',
  gender: 'male',
  birthDate: '1985-05-12',
  allergies: ['Penicillin G', 'Aspirin'],
  bloodGroup: 'O Positive',
};

const initialEncounter: EncounterSummary = {
  id: 'enc-2026-001',
  patientId: 'pat-0001',
  encounterType: 'OPD',
  status: 'in-progress',
  startTime: '2026-10-15T08:30:00Z',
  departmentId: 'dept-opd-med',
};

const currentUser: OrganellaUser = {
  id: 'usr-102',
  username: 'dr.thanakorn',
  fullName: 'นพ. ธนากร วงศ์วิจิตร',
  licenseNumber: 'ว.45892',
  department: 'OPD-MED',
  roles: ['Doctor'],
  permissions: ['patient:read', 'patient:write', 'encounter:read', 'encounter:write'],
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
  const [patient] = useState<PatientDemographics>(initialPatient);
  const [encounter] = useState<EncounterSummary>(initialEncounter);
  const [activeModules, setActiveModules] = useState<ModuleManifest[]>([fallbackDoctorOpdManifest]);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<string>('doctor-opd');
  const [events, setEvents] = useState<Array<{ name: string; time: string; data: any }>>([]);

  // Fetch active module manifests from Core API
  useEffect(() => {
    async function fetchManifests() {
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
    }
    fetchManifests();
  }, []);

  // Event dispatcher functions
  const emitEvent = (eventName: string, data: any) => {
    setEvents((prev) => [
      { name: eventName, time: new Date().toLocaleTimeString(), data },
      ...prev.slice(0, 4),
    ]);
  };

  const onEvent = (_eventName: string, _handler: (data: any) => void) => {
    return () => {};
  };

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
    [patient, encounter, activeModules, activeWorkspaceTab]
  );

  const fhirPatient = toFHIRPatient(patient);

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
                  Micro-Frontend Shell (Phase 2)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Generic Health Engine & Dynamic Slot Registry
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
                </div>
                <p className="text-xs text-slate-500">
                  เลขบัตรประชาชน: {patient.citizenId} | วันเกิด: {patient.birthDate} | รหัส Visit:{' '}
                  {encounter.id} ({encounter.encounterType})
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
                  ⚠️ ประวัติแพ้ยา:
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
                    <span className="text-xs text-slate-400 py-2">ไม่มีโมดูลเวิร์กสเปซที่เปิดใช้งาน</span>
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
                  <p className="text-teal-400 font-bold mb-1">📡 Client-Side Event Bus Activity:</p>
                  <ul className="space-y-1">
                    {events.map((e, i) => (
                      <li key={i}>
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
                  <h3 className="font-bold text-slate-800 text-sm">Dashboard Widgets (Slot)</h3>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">
                    slot: dashboard-widget
                  </span>
                </div>
                <DynamicSlot slotId="dashboard-widget" />
              </div>

              {/* HL7 FHIR Live Interoperability Output */}
              <div className="bg-slate-900 text-slate-200 rounded-xl p-5 shadow-sm font-mono text-xs overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-teal-400 font-bold">⚡ HL7 FHIR R4 Patient Adapter</p>
                  <span className="text-[10px] bg-teal-900/50 text-teal-300 px-2 py-0.5 rounded border border-teal-700">
                    fhir.resources R4
                  </span>
                </div>
                <pre className="text-slate-300 max-h-60 overflow-y-auto">
                  {JSON.stringify(fhirPatient, null, 2)}
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
