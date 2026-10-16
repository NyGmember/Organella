import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  checkRequiredPermissions,
  OrganellaContext,
  PatientTabProps,
} from '@organella/sdk';

export const REQUIRED_VIEW_LAB_ROLES = ['patient:read', 'lab:read'];
export const REQUIRED_ORDER_LAB_ROLES = ['patient:read', 'lab:read', 'lab:order'];
export const REQUIRED_REPORT_LAB_ROLES = ['patient:read', 'lab:read', 'lab:result_write'];

interface MasterLabCatalogItem {
  code: string;
  loinc_code: string;
  test_name: string;
  category: string;
  specimen_type: string;
  unit: string;
  reference_range: string;
  ref_low?: number;
  ref_high?: number;
}

interface LabOrderItem {
  id: string;
  encounter_id?: string;
  patient_id?: string;
  lab_code: string;
  loinc_code?: string;
  test_name: string;
  category: string;
  specimen_type: string;
  priority: string;
  status: string;
  result_value?: string;
  unit?: string;
  reference_range?: string;
  abnormal_flag: string;
  ordered_by_username?: string;
  reported_by_username?: string;
  reported_by_license?: string;
  clinical_note?: string;
}

const FALLBACK_CATALOG: MasterLabCatalogItem[] = [
  {
    code: 'LAB-CBC',
    loinc_code: '58410-2',
    test_name: 'Complete Blood Count - WBC (ความสมบูรณ์ของเม็ดเลือดขาว)',
    category: 'Hematology',
    specimen_type: 'EDTA Whole Blood',
    unit: '10^3/uL',
    reference_range: '4.5 - 11.0 10^3/uL',
    ref_low: 4.5,
    ref_high: 11.0,
  },
  {
    code: 'LAB-FBS',
    loinc_code: '1558-6',
    test_name: 'Fasting Blood Glucose (ระดับน้ำตาลในเลือดหลังอดอาหาร)',
    category: 'Clinical Chemistry',
    specimen_type: 'NaF Fasting Plasma',
    unit: 'mg/dL',
    reference_range: '70 - 99 mg/dL',
    ref_low: 70.0,
    ref_high: 99.0,
  },
  {
    code: 'LAB-HBA1C',
    loinc_code: '4548-4',
    test_name: 'Hemoglobin A1c (ระดับน้ำตาลสะสมในเลือด HbA1c)',
    category: 'Clinical Chemistry',
    specimen_type: 'EDTA Whole Blood',
    unit: '%',
    reference_range: '4.0 - 5.6 %',
    ref_low: 4.0,
    ref_high: 5.6,
  },
  {
    code: 'LAB-CREAT',
    loinc_code: '2160-0',
    test_name: 'Serum Creatinine (การทำงานของไต)',
    category: 'Renal Function',
    specimen_type: 'Clotted Blood / Serum',
    unit: 'mg/dL',
    reference_range: '0.6 - 1.2 mg/dL',
    ref_low: 0.6,
    ref_high: 1.2,
  },
  {
    code: 'LAB-LDL',
    loinc_code: '13457-7',
    test_name: 'LDL Cholesterol (ไขมันคอเลสเตอรอลชนิดไม่ดี)',
    category: 'Lipid Profile',
    specimen_type: 'Clotted Blood / Serum',
    unit: 'mg/dL',
    reference_range: '0 - 130 mg/dL',
    ref_low: 0.0,
    ref_high: 130.0,
  },
  {
    code: 'LAB-ALT',
    loinc_code: '1742-6',
    test_name: 'Alanine Aminotransferase - ALT / SGPT (เอนไซม์ตับ)',
    category: 'Liver Function',
    specimen_type: 'Clotted Blood / Serum',
    unit: 'U/L',
    reference_range: '7 - 40 U/L',
    ref_low: 7.0,
    ref_high: 40.0,
  },
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

  const patientFullName = `${patient.prefix ? patient.prefix + ' ' : ''}${patient.firstName} ${patient.lastName}`.trim();
  const encNumber =
    (activeEncounter as any)?.encounterNumber || activeEncounter?.id || 'ENC-2026-001';

  const viewCheck = useMemo(
    () => checkRequiredPermissions(effectiveUser?.permissions, REQUIRED_VIEW_LAB_ROLES),
    [effectiveUser?.permissions]
  );
  const orderCheck = useMemo(
    () => checkRequiredPermissions(effectiveUser?.permissions, REQUIRED_ORDER_LAB_ROLES),
    [effectiveUser?.permissions]
  );
  const reportCheck = useMemo(
    () => checkRequiredPermissions(effectiveUser?.permissions, REQUIRED_REPORT_LAB_ROLES),
    [effectiveUser?.permissions]
  );

  const canOrderLab = !readonly && orderCheck.allowed;
  const canReportLab = !readonly && reportCheck.allowed;

  const [catalog, setCatalog] = useState<MasterLabCatalogItem[]>(FALLBACK_CATALOG);
  const [labOrders, setLabOrders] = useState<LabOrderItem[]>([]);
  const [loadingLabs, setLoadingLabs] = useState<boolean>(false);

  // Order form state
  const [selectedLabCode, setSelectedLabCode] = useState<string>('LAB-CBC');
  const [orderPriority, setOrderPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [orderNote, setOrderNote] = useState<string>('');
  const [ordering, setOrdering] = useState<boolean>(false);

  // Result reporting state mapped by lab_order_id
  const [resultInputs, setResultInputs] = useState<Record<string, string>>({});
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [reportingId, setReportingId] = useState<string | null>(null);

  const [banner, setBanner] = useState<{
    type: 'success' | 'error';
    message: string;
    missingRoles?: string[];
  } | null>(null);

  const fetchCatalogAndEncounterLabs = async () => {
    setLoadingLabs(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const [catRes, labRes] = await Promise.all([
        fetch('http://localhost:8000/api/v1/modules/doctor-opd/labs/catalog', { headers }),
        fetch(`http://localhost:8000/api/v1/modules/doctor-opd/encounters/${encNumber}/labs`, {
          headers,
        }),
      ]);

      if (catRes.ok) {
        const catData = await catRes.json();
        if (Array.isArray(catData) && catData.length > 0) {
          setCatalog(catData);
        }
      }
      if (labRes.ok) {
        const labData: LabOrderItem[] = await labRes.json();
        setLabOrders(labData);
        const initRes: Record<string, string> = {};
        const initNotes: Record<string, string> = {};
        for (const item of labData) {
          if (item.result_value) initRes[item.id] = item.result_value;
          if (item.clinical_note) initNotes[item.id] = item.clinical_note;
        }
        setResultInputs(initRes);
        setNoteInputs(initNotes);
      }
    } catch {
      // Fallback in standalone preview
    } finally {
      setLoadingLabs(false);
    }
  };

  useEffect(() => {
    fetchCatalogAndEncounterLabs();
  }, [encNumber, authToken]);

  const handleOrderLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderCheck.allowed) {
      setBanner({
        type: 'error',
        message: orderCheck.errorMessage || 'ไม่มีสิทธิ์สั่งตรวจทางห้องปฏิบัติการ',
        missingRoles: orderCheck.missingRoles,
      });
      return;
    }

    const chosen = catalog.find((c) => c.code === selectedLabCode) || FALLBACK_CATALOG[0];
    setOrdering(true);
    setBanner(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(
        `http://localhost:8000/api/v1/modules/doctor-opd/encounters/${encNumber}/labs`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            lab_code: chosen.code,
            loinc_code: chosen.loinc_code,
            test_name: chosen.test_name,
            category: chosen.category,
            specimen_type: chosen.specimen_type,
            priority: orderPriority,
            unit: chosen.unit,
            reference_range: chosen.reference_range,
            clinical_note: orderNote || undefined,
          }),
        }
      );

      if (res.ok) {
        const created: LabOrderItem = await res.json();
        setLabOrders((prev) => [...prev, created]);
        setOrderNote('');
        setBanner({
          type: 'success',
          message: `สั่งตรวจแล็บ ${created.lab_code} (LOINC ${created.loinc_code}: ${created.test_name}) สำเร็จ! ส่งใบสั่งตรวจไปยังห้องปฏิบัติการแล้ว`,
        });
        if (ctx?.emitEvent) {
          ctx.emitEvent('lab:order-created', {
            encounterNumber: encNumber,
            labCode: created.lab_code,
            loincCode: created.loinc_code,
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        setBanner({
          type: 'error',
          message: typeof detail === 'object' ? detail.message : detail || 'ไม่สามารถสั่งแล็บได้',
          missingRoles: typeof detail === 'object' ? detail.missing_roles : undefined,
        });
      }
    } catch {
      setBanner({
        type: 'error',
        message: 'ไม่สามารถเชื่อมต่อ Core API ที่พอร์ต 8000 ได้',
      });
    } finally {
      setOrdering(false);
    }
  };

  const handleReportResult = async (labOrder: LabOrderItem) => {
    if (!reportCheck.allowed) {
      setBanner({
        type: 'error',
        message: reportCheck.errorMessage || 'ไม่มีสิทธิ์รายงานและรับรองผลตรวจทางห้องปฏิบัติการ',
        missingRoles: reportCheck.missingRoles,
      });
      return;
    }

    const val = (resultInputs[labOrder.id] || '').trim();
    if (!val) {
      setBanner({
        type: 'error',
        message: `กรุณาระบุค่าผลตรวจสำหรับ ${labOrder.lab_code} ก่อนยืนยันผล`,
      });
      return;
    }

    setReportingId(labOrder.id);
    setBanner(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(
        `http://localhost:8000/api/v1/modules/doctor-opd/labs/${labOrder.id}/result`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            result_value: val,
            clinical_note: noteInputs[labOrder.id] || labOrder.clinical_note,
          }),
        }
      );

      if (res.ok) {
        const updated: LabOrderItem = await res.json();
        setLabOrders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setBanner({
          type: 'success',
          message: `รายงานผลแล็บ ${updated.lab_code} = ${updated.result_value} ${updated.unit || ''} (${updated.abnormal_flag.toUpperCase()}) สำเร็จ โดย ${effectiveUser?.fullName} (${effectiveUser?.licenseNumber || 'นักเทคนิคการแพทย์'})`,
        });
        if (ctx?.emitEvent) {
          ctx.emitEvent('lab:result-reported', {
            labOrderId: updated.id,
            labCode: updated.lab_code,
            resultValue: updated.result_value,
            abnormalFlag: updated.abnormal_flag,
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        setBanner({
          type: 'error',
          message:
            typeof detail === 'object' ? detail.message : detail || 'ไม่สามารถรายงานผลแล็บได้',
          missingRoles: typeof detail === 'object' ? detail.missing_roles : undefined,
        });
      }
    } catch {
      setBanner({
        type: 'error',
        message: 'ไม่สามารถเชื่อมต่อ Core API ที่พอร์ต 8000 ได้',
      });
    } finally {
      setReportingId(null);
    }
  };

  if (!viewCheck.allowed) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-900">
        <h3 className="text-base font-bold">
          ⛔ ปฏิเสธการเข้าถึงห้องปฏิบัติการ (Role-List Permission Guard)
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

  return (
    <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-violet-100 text-violet-800 rounded-full">
              @organella-module/lab-lis
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Port 5004 • LOINC & HL7 FHIR R4 Observation
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            🔬 ห้องปฏิบัติการทางการแพทย์และการสั่งตรวจวิเคราะห์ (Laboratory & Diagnostic LIS)
          </h2>
          <p className="text-sm text-slate-500">
            ผู้ป่วย: <strong className="text-slate-800">{patientFullName}</strong> ({patient.hn}) •
            Encounter: <span className="font-mono font-bold text-violet-700">{encNumber}</span>
          </p>
        </div>
      </div>

      {/* Role-List Permission Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div
          className={`p-3 rounded-lg border flex items-center justify-between ${
            canOrderLab
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/70 border-amber-200 text-amber-900'
          }`}
        >
          <div>
            <span className="font-bold">สิทธิ์แพทย์สั่งตรวจแล็บ (Doctor Lab Order):</span>{' '}
            <span className="font-mono">[{REQUIRED_ORDER_LAB_ROLES.join(', ')}]</span>
          </div>
          {canOrderLab ? (
            <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-900 rounded font-bold">
              ✓ สั่งตรวจได้
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded font-mono">
              ขาดสิทธิ์: {orderCheck.missingRoles.join(', ') || 'Read-only'}
            </span>
          )}
        </div>

        <div
          className={`p-3 rounded-lg border flex items-center justify-between ${
            canReportLab
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/70 border-amber-200 text-amber-900'
          }`}
        >
          <div>
            <span className="font-bold">สิทธิ์นักเทคนิคการแพทย์รายงานผล (LIS Result Sign-off):</span>{' '}
            <span className="font-mono">[{REQUIRED_REPORT_LAB_ROLES.join(', ')}]</span>
          </div>
          {canReportLab ? (
            <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-900 rounded font-bold">
              ✓ รายงานผลได้
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded font-mono">
              ขาดสิทธิ์: {reportCheck.missingRoles.join(', ') || 'Read-only'}
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

      {/* SECTION 1: DOCTOR LAB ORDER ENTRY FORM */}
      <form
        onSubmit={handleOrderLab}
        className="p-4 rounded-xl bg-violet-50/50 border border-violet-200 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-violet-950">
            ➕ สั่งตรวจวิเคราะห์ทางห้องปฏิบัติการ (Doctor LOINC Lab Order Entry)
          </h3>
          <span className="text-xs font-mono text-violet-700">
            Catalog: {catalog.length} LOINC Items
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              เลือกรายการตรวจวิเคราะห์ (Master Lab Test / LOINC)
            </label>
            <select
              value={selectedLabCode}
              onChange={(e) => setSelectedLabCode(e.target.value)}
              disabled={!canOrderLab}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold bg-white"
            >
              {catalog.map((item) => (
                <option key={item.code} value={item.code}>
                  [{item.code} | LOINC {item.loinc_code}] {item.test_name} (Ref:{' '}
                  {item.reference_range})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ความเร่งด่วน (Order Priority)
            </label>
            <select
              value={orderPriority}
              onChange={(e) =>
                setOrderPriority(e.target.value as 'routine' | 'urgent' | 'stat')
              }
              disabled={!canOrderLab}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold bg-white"
            >
              <option value="routine">Routine (ปกติ)</option>
              <option value="urgent">Urgent (ด่วน)</option>
              <option value="stat">STAT (ด่วนวิกฤต ภายใน 30 นาที)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ข้อบ่งชี้ทางคลินิก (Clinical Note)
            </label>
            <input
              type="text"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              disabled={!canOrderLab}
              placeholder="เช่น ตรวจติดตามน้ำตาล/การทำงานของไต"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={ordering || !canOrderLab}
            className={`px-4 py-2 rounded-lg font-bold text-xs shadow-sm transition-all ${
              canOrderLab
                ? 'bg-violet-600 hover:bg-violet-700 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            {ordering ? 'กำลังส่งคำสั่งตรวจแล็บ...' : '📋 สั่งตรวจทางห้องปฏิบัติการ (Order Lab Test)'}
          </button>
        </div>
      </form>

      {/* SECTION 2: ACTIVE LAB ORDERS & LIS RESULT WORKBENCH */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">
            🧪 รายการสั่งตรวจและผลวิเคราะห์ทางห้องปฏิบัติการ ({labOrders.length} รายการ)
          </h3>
          <button
            type="button"
            onClick={fetchCatalogAndEncounterLabs}
            className="text-xs font-semibold text-violet-700 hover:underline"
          >
            🔄 รีเฟรชรายการแล็บ
          </button>
        </div>

        {loadingLabs ? (
          <div className="p-6 text-center text-sm text-slate-500">
            กำลังโหลดรายการตรวจทางห้องปฏิบัติการ...
          </div>
        ) : labOrders.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm">
            ยังไม่มีรายการสั่งตรวจทางห้องปฏิบัติการสำหรับ Encounter ({encNumber}) นี้
          </div>
        ) : (
          <div className="space-y-3">
            {labOrders.map((lo) => {
              const flagBadge =
                lo.abnormal_flag === 'critical'
                  ? 'bg-red-600 text-white animate-pulse'
                  : lo.abnormal_flag === 'high'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : lo.abnormal_flag === 'low'
                  ? 'bg-sky-100 text-sky-900 border border-sky-300'
                  : lo.abnormal_flag === 'normal'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-slate-100 text-slate-600';

              const flagLabel =
                lo.abnormal_flag === 'critical'
                  ? '🚨 ค่าวิกฤต (CRITICAL)'
                  : lo.abnormal_flag === 'high'
                  ? '▲ สูงกว่าค่าอ้างอิง (HIGH)'
                  : lo.abnormal_flag === 'low'
                  ? '▼ ต่ำกว่าค่าอ้างอิง (LOW)'
                  : lo.abnormal_flag === 'normal'
                  ? '✓ ปกติ (NORMAL)'
                  : '⏳ รอผลวิเคราะห์ (PENDING)';

              return (
                <div
                  key={lo.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-violet-100 text-violet-900 font-mono text-xs font-bold">
                          {lo.lab_code}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[11px]">
                          LOINC: {lo.loinc_code || '00000-0'}
                        </span>
                        <span className="font-bold text-sm text-slate-900">{lo.test_name}</span>
                        <span className="text-xs text-slate-500">
                          ({lo.category} • สิ่งส่งตรวจ: {lo.specimen_type})
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 mt-1">
                        ค่าอ้างอิงมาตรฐาน (Reference Range):{' '}
                        <strong className="font-mono text-slate-700">
                          {lo.reference_range || '-'}
                        </strong>
                        {lo.ordered_by_username && (
                          <span> • สั่งตรวจโดย: {lo.ordered_by_username}</span>
                        )}
                        {lo.reported_by_username && (
                          <span>
                            {' '}
                            • รับรองผลโดย: {lo.reported_by_username}{' '}
                            {lo.reported_by_license ? `(${lo.reported_by_license})` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {lo.result_value && (
                        <div className="px-3 py-1 rounded-lg bg-white border border-slate-300 font-mono text-sm font-extrabold text-slate-900">
                          {lo.result_value}{' '}
                          <span className="text-xs font-normal text-slate-500">{lo.unit}</span>
                        </div>
                      )}
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${flagBadge}`}>
                        {flagLabel}
                      </span>
                    </div>
                  </div>

                  {/* LIS Result Entry Form for Medical Technologist */}
                  <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 flex-1">
                      <label className="text-xs font-bold text-slate-700">
                        บันทึกผลตรวจ ({lo.unit || 'Unit'}):
                      </label>
                      <input
                        type="text"
                        value={resultInputs[lo.id] ?? ''}
                        onChange={(e) =>
                          setResultInputs((prev) => ({ ...prev, [lo.id]: e.target.value }))
                        }
                        disabled={!canReportLab}
                        placeholder={`ระบุค่าผลตรวจ (${lo.reference_range || lo.unit || ''})`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono font-bold bg-white w-44"
                      />
                      <input
                        type="text"
                        value={noteInputs[lo.id] ?? ''}
                        onChange={(e) =>
                          setNoteInputs((prev) => ({ ...prev, [lo.id]: e.target.value }))
                        }
                        disabled={!canReportLab}
                        placeholder="หมายเหตุนักเทคนิคการแพทย์ (ถ้ามี)"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white flex-1 min-w-[180px]"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleReportResult(lo)}
                      disabled={reportingId === lo.id || !canReportLab}
                      className={`px-4 py-1.5 rounded-lg font-bold text-xs shadow-sm transition-all ${
                        canReportLab
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                          : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {reportingId === lo.id
                        ? 'กำลังบันทึกผล...'
                        : '🧪 ยืนยันและรับรองผลแล็บ (Report LOINC Result)'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspaceTab;
