import { useState } from 'react';
import type { PatientDemographics, EncounterSummary } from '@organella/sdk';
import { toFHIRPatient } from '@organella/fhir-helpers';
import { SlotHost } from './components/SlotHost';

const samplePatient: PatientDemographics = {
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

const sampleEncounter: EncounterSummary = {
  id: 'enc-2026-001',
  patientId: 'pat-0001',
  encounterType: 'OPD',
  status: 'in-progress',
  startTime: '2026-10-14T08:30:00Z',
  departmentId: 'dept-opd-med',
};

export function App() {
  const [patient] = useState<PatientDemographics>(samplePatient);
  const [encounter] = useState<EncounterSummary>(sampleEncounter);
  const fhirPatient = toFHIRPatient(patient);

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-lg">
            🧬
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">Organella</h1>
            <p className="text-xs text-slate-500">Open-Source Modular Healthcare Platform</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <span className="text-xs bg-teal-50 text-teal-700 px-2.5 py-1 rounded-full border border-teal-200 font-medium">
            Core Shell v1.0.0 (Phase 0 Skeleton)
          </span>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-700">นพ. ธนากร วงศ์วิจิตร</p>
            <p className="text-xs text-slate-400">แผนกอายุรกรรม (OPD-MED)</p>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Patient Context Banner */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-bold text-slate-800">
                  {patient.prefix} {patient.firstName} {patient.lastName}
                </h2>
                <span className="text-sm bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                  HN: {patient.hn}
                </span>
                <span className="text-sm bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                  เพศ: {patient.gender === 'male' ? 'ชาย' : 'หญิง'}
                </span>
                <span className="text-sm bg-amber-50 text-amber-700 px-2 py-0.5 rounded">
                  กรุ๊ปเลือด: {patient.bloodGroup}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                เลขบัตรประชาชน: {patient.citizenId} | วันเกิด: {patient.birthDate} | รหัสเข้ารับบริการ: {encounter.id}
              </p>
            </div>

            {/* Banner Actions Slot */}
            <div className="flex items-center space-x-2">
              <SlotHost slotId="patient-banner-action" fallbackText="Slot: patient-banner-action" />
            </div>
          </div>

          {patient.allergies && patient.allergies.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center space-x-2">
              <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                ⚠️ ประวัติแพ้ยา:
              </span>
              <span className="text-xs text-red-700 font-medium">
                {patient.allergies.join(', ')}
              </span>
            </div>
          )}
        </section>

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Patient Workspace Tab Slot */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                <h3 className="font-bold text-slate-700">Clinical Workspace (Extension Slot)</h3>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">
                  Slot ID: patient-workspace-tab
                </span>
              </div>
              <SlotHost
                slotId="patient-workspace-tab"
                fallbackText="พร้อมรองรับ Remote Module (เช่น doctor-opd ConsultationTab)"
              />
            </div>
          </div>

          {/* Sidebar Dashboard Widget Slot & FHIR Live Preview */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="border-b border-slate-100 pb-3 mb-4">
                <h3 className="font-bold text-slate-700">Dashboard Widget Slot</h3>
                <p className="text-xs text-slate-400">Slot ID: dashboard-widget</p>
              </div>
              <SlotHost
                slotId="dashboard-widget"
                fallbackText="พร้อมรองรับ Remote Widget (เช่น DoctorQueueWidget)"
              />
            </div>

            <div className="bg-slate-900 text-slate-200 rounded-xl p-5 shadow-sm font-mono text-xs overflow-x-auto">
              <p className="text-teal-400 font-bold mb-2">⚡ HL7 FHIR R4 Patient Mapping Preview:</p>
              <pre>{JSON.stringify(fhirPatient, null, 2)}</pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
