import React, { useState } from 'react';
import type { PatientTabProps } from '@organella/sdk';

export const ConsultationTab: React.FC<PatientTabProps> = ({
  patient,
  activeEncounter,
  readonly,
}) => {
  const [soap, setSoap] = useState({
    subjective: 'มีไข้ ไอ เจ็บคอ มา 2 วัน รับประทานยาพาราเซตามอลแล้วไม่ดีขึ้น',
    objective: 'BT 38.5 C, BP 120/80 mmHg, PR 82 bpm, Throat: mildly injected, No exudate',
    assessment: 'J00 - Acute nasopharyngitis [common cold]',
    plan: '1. Paracetamol (500mg) 1 tab prn q 4-6 hr\n2. Dextromethorphan syrup 1 tsp tid pc\n3. ดื่มน้ำอุ่นและพักผ่อน',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div>
          <h4 className="font-semibold text-slate-800">บันทึกเวชระเบียนการตรวจ (SOAP Note)</h4>
          <p className="text-xs text-slate-400">
            ผู้ป่วย: {patient.prefix} {patient.firstName} {patient.lastName} (HN: {patient.hn}) | Visit: {activeEncounter?.id}
          </p>
        </div>
        <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-200">
          Remote Module: doctor-opd
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Subjective */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600">
            S (Subjective) - อาการสำคัญ & ประวัติ:
          </label>
          <textarea
            disabled={readonly}
            value={soap.subjective}
            onChange={(e) => setSoap({ ...soap, subjective: e.target.value })}
            className="w-full text-xs p-2.5 border rounded-lg focus:ring-1 focus:ring-teal-500 min-h-[70px] bg-white border-slate-200"
          />
        </div>

        {/* Objective */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600">
            O (Objective) - ตรวจร่างกาย & สัญญาณชีพ:
          </label>
          <textarea
            disabled={readonly}
            value={soap.objective}
            onChange={(e) => setSoap({ ...soap, objective: e.target.value })}
            className="w-full text-xs p-2.5 border rounded-lg focus:ring-1 focus:ring-teal-500 min-h-[70px] bg-white border-slate-200"
          />
        </div>

        {/* Assessment */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600">
            A (Assessment) - การวินิจฉัยโรค (ICD-10):
          </label>
          <input
            disabled={readonly}
            type="text"
            value={soap.assessment}
            onChange={(e) => setSoap({ ...soap, assessment: e.target.value })}
            className="w-full text-xs p-2.5 border rounded-lg focus:ring-1 focus:ring-teal-500 bg-white border-slate-200"
          />
        </div>

        {/* Plan */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600">
            P (Plan) - สั่งยา & แผนการรักษา:
          </label>
          <textarea
            disabled={readonly}
            value={soap.plan}
            onChange={(e) => setSoap({ ...soap, plan: e.target.value })}
            className="w-full text-xs p-2.5 border rounded-lg focus:ring-1 focus:ring-teal-500 min-h-[70px] bg-white border-slate-200"
          />
        </div>
      </div>

      {!readonly && (
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg shadow-sm transition-colors"
          >
            บันทึกการตรวจและส่งต่อไปห้องยา
          </button>
        </div>
      )}
    </div>
  );
};

export default ConsultationTab;
