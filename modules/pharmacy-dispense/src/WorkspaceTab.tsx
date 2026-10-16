import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  checkRequiredPermissions,
  OrganellaContext,
  PatientTabProps,
} from '@organella/sdk';

export const REQUIRED_VIEW_RX_ROLES = ['patient:read', 'medication:read'];
export const REQUIRED_DISPENSE_ROLES = [
  'patient:read',
  'medication:read',
  'medication:dispense',
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
    () => checkRequiredPermissions(effectiveUser?.permissions, REQUIRED_VIEW_RX_ROLES),
    [effectiveUser?.permissions]
  );

  const dispenseCheck = useMemo(
    () => checkRequiredPermissions(effectiveUser?.permissions, REQUIRED_DISPENSE_ROLES),
    [effectiveUser?.permissions]
  );

  const canDispense = !readonly && dispenseCheck.allowed;

  const [medications, setMedications] = useState<Array<any>>([
    {
      medication_code: 'RX-PARA-500',
      medication_name: 'Paracetamol 500 mg Tablet',
      dosage_instruction: 'รับประทานครั้งละ 1 เม็ด ทุก 4-6 ชั่วโมง เวลาปวดหรือมีไข้',
      quantity: 20,
      unit: 'tablet',
      status: 'active',
    },
    {
      medication_code: 'RX-ROXI-150',
      medication_name: 'Roxithromycin 150 mg Tablet (Safe for Penicillin Allergy)',
      dosage_instruction: 'รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง ก่อนอาหารเช้า-เย็น',
      quantity: 14,
      unit: 'tablet',
      status: 'active',
    },
  ]);

  const [dispensing, setDispensing] = useState<boolean>(false);
  const [banner, setBanner] = useState<{
    type: 'success' | 'error';
    message: string;
    missingRoles?: string[];
  } | null>(null);

  useEffect(() => {
    const encAny = activeEncounter as any;
    if (encAny && Array.isArray(encAny.medications) && encAny.medications.length > 0) {
      setMedications(encAny.medications);
    }
    setBanner(null);
  }, [activeEncounter?.id, patient.id]);

  const handleConfirmDispense = async () => {
    if (!dispenseCheck.allowed) {
      setBanner({
        type: 'error',
        message: dispenseCheck.errorMessage || 'ไม่มีสิทธิ์ยืนยันการจ่ายยา',
        missingRoles: dispenseCheck.missingRoles,
      });
      return;
    }

    setDispensing(true);
    setBanner(null);
    const encNumber =
      (activeEncounter as any)?.encounterNumber || activeEncounter?.id || 'ENC-2026-001';

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(
        `http://localhost:8000/api/v1/modules/doctor-opd/encounters/${encNumber}/dispense`,
        {
          method: 'POST',
          headers,
        }
      );

      if (res.ok) {
        const updated = await res.json();
        setMedications(updated.medications || []);
        setBanner({
          type: 'success',
          message: `ยืนยันการตรวจสอบแพ้ยาและจ่ายยาผู้ป่วยนอกสำเร็จ โดย ${effectiveUser?.fullName} (${effectiveUser?.licenseNumber || 'เภสัชกร'})`,
        });
        if (ctx?.emitEvent) {
          ctx.emitEvent('pharmacy:medication-dispensed', {
            encounterNumber: encNumber,
            patientHn: patient.hn,
            dispensedBy: effectiveUser?.username,
            pharmacistLicense: effectiveUser?.licenseNumber,
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        setBanner({
          type: 'error',
          message: typeof detail === 'object' ? detail.message : detail || 'ไม่สามารถจ่ายยาได้',
          missingRoles: typeof detail === 'object' ? detail.missing_roles : undefined,
        });
      }
    } catch {
      setBanner({
        type: 'error',
        message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ Core API ได้',
      });
    } finally {
      setDispensing(false);
    }
  };

  if (!viewCheck.allowed && !readonly) {
    return (
      <div className="p-5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 space-y-2">
        <h4 className="font-bold text-sm">🚫 ปฏิเสธการเข้าถึงโมดูลห้องจ่ายยา</h4>
        <p>{viewCheck.errorMessage}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {viewCheck.requiredRoles.map((r) => (
            <span
              key={r}
              className={`font-mono px-2 py-0.5 rounded border ${
                viewCheck.missingRoles.includes(r)
                  ? 'bg-red-100 text-red-800 border-red-300 font-bold'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {viewCheck.missingRoles.includes(r) ? `✗ ขาดสิทธิ์: ${r}` : `✓ มีสิทธิ์: ${r}`}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h4 className="font-bold text-slate-900 text-base">
            💊 ระบบห้องจ่ายยาและตรวจสอบความปลอดภัยด้านยา (Pharmacy Dispensing)
          </h4>
          <p className="text-xs text-slate-500">
            ผู้ป่วย: <strong>{patient.prefix} {patient.firstName} {patient.lastName}</strong> (HN: {patient.hn}) | Visit: <span className="font-mono">{activeEncounter?.id || 'ENC-2026-001'}</span>
          </p>
        </div>
        <span className="text-[11px] bg-amber-50 text-amber-800 px-2.5 py-1 rounded border border-amber-200 font-mono">
          module: pharmacy-dispense (Port 5002)
        </span>
      </div>

      {/* Drug Allergy Verification Box */}
      <div
        className={`p-3.5 rounded-xl border text-xs ${
          patient.allergies && patient.allergies.length > 0
            ? 'bg-red-50 border-red-300 text-red-900'
            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}
      >
        <p className="font-bold">
          {patient.allergies && patient.allergies.length > 0
            ? `⚠️ แจ้งเตือนเภสัชกร — ผู้ป่วยมีประวัติแพ้ยา: ${patient.allergies.join(', ')}`
            : '✓ ผู้ป่วยปฏิเสธประวัติแพ้ยา (NKDA)'}
        </p>
      </div>

      {/* Role-List Guard Notice if current user lacks medication:dispense */}
      {!canDispense && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1">
          <p className="font-bold">
            🔒 โหมดดูรายการใบสั่งยา (การยืนยันจ่ายยาต้องใช้สิทธิ์ของเภสัชกร)
          </p>
          {dispenseCheck.missingRoles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="font-semibold text-red-700">ขาดสิทธิ์ที่จำเป็น (Missing Roles):</span>
              {dispenseCheck.missingRoles.map((mr) => (
                <span
                  key={mr}
                  className="font-mono font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-300"
                >
                  {mr}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {banner && (
        <div
          className={`p-3.5 rounded-xl border text-xs ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <p className="font-semibold">{banner.message}</p>
        </div>
      )}

      {/* Prescribed Medications List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold text-slate-700 uppercase">
            รายการยาตามคำสั่งแพทย์ ({medications.length} รายการ)
          </h5>
          <span className="text-[10px] font-mono bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
            requires: [patient:read, medication:read, medication:dispense]
          </span>
        </div>

        {medications.map((med, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"
          >
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-900">{med.medication_name}</span>
                <span className="font-mono bg-teal-100 text-teal-800 px-2 py-0.5 rounded font-bold text-[11px]">
                  {med.quantity} {med.unit}
                </span>
              </div>
              <p className="text-slate-600 text-[11px]">ฉลากยา (Sig): {med.dosage_instruction}</p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                med.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              {med.status === 'completed' ? '✓ จ่ายยาแล้ว (Dispensed)' : '⏳ รอตรวจสอบ/จ่ายยา'}
            </span>
          </div>
        ))}
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="button"
          disabled={dispensing || !canDispense}
          onClick={handleConfirmDispense}
          className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-sm"
        >
          {dispensing
            ? 'กำลังบันทึกการจ่ายยา...'
            : canDispense
            ? `💊 ยืนยันการตรวจสอบแพ้ยาและจ่ายยาผู้ป่วยนอก (${effectiveUser?.fullName})`
            : '🔒 ปิดการจ่ายยา (ต้องการสิทธิ์ medication:dispense)'}
        </button>
      </div>
    </div>
  );
};

export default WorkspaceTab;
