import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConsultationTab } from './ConsultationTab';
import { DoctorQueueWidget } from './DoctorQueueWidget';

const mockPatient = {
  id: 'pat-0001',
  hn: '670001',
  citizenId: '1-1002-00345-67-8',
  prefix: 'นาย',
  firstName: 'สมศักดิ์',
  lastName: 'มั่นคง',
  gender: 'male' as const,
  birthDate: '1985-05-12',
  allergies: ['Penicillin G', 'Aspirin'],
  bloodGroup: 'O Positive',
};

const mockEncounter = {
  id: 'enc-2026-001',
  patientId: 'pat-0001',
  encounterType: 'OPD' as const,
  status: 'in-progress' as const,
  startTime: '2026-10-15T08:30:00Z',
  departmentId: 'dept-opd-med',
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="min-h-screen bg-slate-100 text-slate-800 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Module Header */}
        <header className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
              🩺
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">
                  Doctor OPD & Clinical Notes Module
                </h1>
                <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  v1.0.0 (Standalone Mode)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                โมดูลห้องตรวจแพทย์ บันทึก SOAP Note, วินิจฉัยโรค ICD-10 และสั่งการรักษา (ไม่ต้อง Login)
              </p>
            </div>
          </div>

          <div className="text-right text-xs">
            <span className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-medium border border-slate-200">
              พอร์ต: 5001 | Remote Module
            </span>
          </div>
        </header>

        {/* Patient Demographic Banner */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-bold text-slate-900">
              {mockPatient.prefix} {mockPatient.firstName} {mockPatient.lastName}
            </h2>
            <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-mono font-medium">
              HN: {mockPatient.hn}
            </span>
            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
              เพศ: ชาย
            </span>
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium">
              กรุ๊ปเลือด: {mockPatient.bloodGroup}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            เลขบัตรประชาชน: {mockPatient.citizenId} | วันเกิด: {mockPatient.birthDate} | Visit: {mockEncounter.id}
          </p>
          {mockPatient.allergies.length > 0 && (
            <div className="pt-2 flex items-center space-x-2 text-xs">
              <span className="font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                ⚠️ ประวัติแพ้ยา:
              </span>
              <span className="text-red-700 font-semibold">{mockPatient.allergies.join(', ')}</span>
            </div>
          )}
        </section>

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Clinical Note (2 cols) */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm mb-4 pb-2 border-b border-slate-100">
              Extension Slot: patient-workspace-tab (ConsultationTab)
            </h3>
            <ConsultationTab
              moduleId="doctor-opd"
              patient={mockPatient}
              activeEncounter={mockEncounter}
            />
          </div>

          {/* Queue Widget (1 col) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm mb-4 pb-2 border-b border-slate-100">
              Extension Slot: dashboard-widget (DoctorQueueWidget)
            </h3>
            <DoctorQueueWidget moduleId="doctor-opd" userId="usr-1" />
          </div>
        </div>
      </div>
    </div>
  </React.StrictMode>
);
