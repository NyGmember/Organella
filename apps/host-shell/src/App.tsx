import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  checkRequiredPermissions,
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
import { AdminMasterDataConsole } from './components/AdminMasterDataConsole';

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

const fallbackPharmacyManifest: ModuleManifest = {
  id: 'pharmacy-dispense',
  name: 'Pharmacy Dispensing & Drug Safety',
  version: '0.1.0',
  author: 'Organella Community',
  description: 'ระบบห้องจ่ายยาผู้ป่วยนอก ตรวจสอบแพ้ยา และยืนยันการจ่ายยา',
  permissions: ['patient:read', 'medication:read', 'medication:dispense'],
  frontend: {
    entry: 'http://localhost:5002/assets/remoteEntry.js',
    slots: [
      {
        slotId: 'patient-workspace-tab',
        title: 'ห้องจ่ายยา (Pharmacy Dispense)',
        component: './WorkspaceTab',
      },
    ],
  },
};

const fallbackReceptionTriageManifest: ModuleManifest = {
  id: 'reception-triage',
  name: 'Reception, Queue & Nursing Triage',
  version: '0.1.0',
  author: 'Organella Community',
  description: 'ระบบเวชระเบียน ออกคิวผู้ป่วยนอก และจุดคัดกรองสัญญาณชีพพยาบาล',
  permissions: ['patient:read', 'queue:manage', 'triage:read', 'triage:write'],
  frontend: {
    entry: 'http://localhost:5003/assets/remoteEntry.js',
    slots: [
      {
        slotId: 'patient-workspace-tab',
        title: 'เวชระเบียนและคัดกรอง (Reception & Triage)',
        component: './WorkspaceTab',
      },
    ],
  },
};

const fallbackLabLisManifest: ModuleManifest = {
  id: 'lab-lis',
  name: 'Laboratory & Diagnostic Orders (LIS)',
  version: '0.1.0',
  author: 'Organella Community',
  description: 'ระบบห้องปฏิบัติการทางการแพทย์ สั่งตรวจวิเคราะห์ LOINC และรายงานผลแล็บ',
  permissions: ['patient:read', 'lab:read', 'lab:order', 'lab:result_write'],
  frontend: {
    entry: 'http://localhost:5004/assets/remoteEntry.js',
    slots: [
      {
        slotId: 'patient-workspace-tab',
        title: 'ห้องปฏิบัติการ (Laboratory LIS)',
        component: './WorkspaceTab',
      },
    ],
  },
};

const DEMO_ACCOUNTS = [
  {
    username: 'dr.thanakorn',
    password: 'doctor12345',
    title: '👨‍⚕️ แพทย์ (Doctor)',
    desc: 'นพ. ธนากร (ว.45892) — สิทธิ์ตรวจรักษา วินิจฉัย ICD-10 สั่งแล็บ และสั่งยา',
    badge: 'bg-teal-50 text-teal-800 border-teal-300',
  },
  {
    username: 'admin',
    password: 'admin12345',
    title: '👨‍💼 ผู้ดูแลระบบ (System Admin)',
    desc: 'จัดการผู้ใช้/สิทธิ์, นำเข้า ICD-10, ยา & LOINC (ไม่มีสิทธิ์สั่งยาหรือบันทึกแทนแพทย์)',
    badge: 'bg-indigo-50 text-indigo-800 border-indigo-300',
  },
  {
    username: 'nurse.suda',
    password: 'nurse12345',
    title: '👩‍⚕️ พยาบาลคัดกรอง (Triage Nurse)',
    desc: 'พว. สุดาพร — บันทึกอาการแรกรับและวัดสัญญาณชีพ (ล็อกการสั่งยา/วินิจฉัย)',
    badge: 'bg-blue-50 text-blue-800 border-blue-300',
  },
  {
    username: 'lab.somkid',
    password: 'lab12345',
    title: '🔬 นักเทคนิคการแพทย์ (Medical Technologist)',
    desc: 'ทน. สมคิด (ทน.14209) — รับสิ่งส่งตรวจและรายงานผลแล็บ LOINC',
    badge: 'bg-violet-50 text-violet-800 border-violet-300',
  },
  {
    username: 'pharm.wichai',
    password: 'pharm12345',
    title: '💊 เภสัชกร (Pharmacist)',
    desc: 'ภก. วิชัย — ตรวจสอบใบสั่งยาและจัดการบัญชียาโรงพยาบาล (Formulary)',
    badge: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  {
    username: 'reg.somporn',
    password: 'reg12345',
    title: '🗂️ เวชระเบียน (Receptionist)',
    desc: 'คุณสมพร — นำเข้าและลงทะเบียนผู้ป่วย (MPI) และออกคิวตรวจ',
    badge: 'bg-purple-50 text-purple-800 border-purple-300',
  },
  {
    username: 'auditor.kanya',
    password: 'audit12345',
    title: '🛡️ ผู้ตรวจสอบ (PDPA Auditor)',
    desc: 'คุณกัญญา — ตรวจสอบประวัติ Audit Logs อย่างเดียว (Read-only)',
    badge: 'bg-slate-100 text-slate-800 border-slate-300',
  },
];

// Required role lists per portal view (Checked exclusively against user.permissions, NEVER by Group name)
const PORTAL_VIEWS: Array<{
  id: 'clinical' | 'admin-master' | 'host-preview';
  label: string;
  requiredRoles: string[];
}> = [
  {
    id: 'clinical',
    label: '🩺 Clinical Workbench (ห้องตรวจ คัดกรอง แล็บ และห้องยา)',
    requiredRoles: ['patient:read'],
  },
  {
    id: 'admin-master',
    label: '⚙️ Master Data & RBAC Settings (จัดการข้อมูลหลักและสิทธิ์)',
    requiredRoles: [], // Sub-tabs inside check their own specific requiredRoles list
  },
  {
    id: 'host-preview',
    label: '👁️ Host Shell Module Preview (โหมดดูตัวอย่าง Read-Only)',
    requiredRoles: ['admin:modules'],
  },
];

export function App() {
  // Authentication state (Strict Login required)
  const [authToken, setAuthToken] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<OrganellaUser | null>(null);
  const [loginUsername, setLoginUsername] = useState<string>('dr.thanakorn');
  const [loginPassword, setLoginPassword] = useState<string>('doctor12345');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState<boolean>(false);

  // Portal Navigation View
  const [portalView, setPortalView] = useState<'clinical' | 'admin-master' | 'host-preview'>(
    'clinical'
  );

  // Clinical Context State
  const [patient, setPatient] = useState<PatientDemographics>(initialPatient);
  const [encounter, setEncounter] = useState<EncounterSummary & Record<string, any>>(
    initialEncounter
  );
  const [conditions, setConditions] = useState<ClinicalConditionInput[]>(initialConditions);
  const [medications, setMedications] = useState<ClinicalMedicationInput[]>(initialMedications);
  const [activeModules, setActiveModules] = useState<ModuleManifest[]>([
    fallbackReceptionTriageManifest,
    fallbackDoctorOpdManifest,
    fallbackLabLisManifest,
    fallbackPharmacyManifest,
  ]);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<string>('doctor-opd');
  const [events, setEvents] = useState<Array<{ name: string; time: string; data: any }>>([]);

  const mapBackendUser = (u: any): OrganellaUser => ({
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    licenseNumber: u.license_number,
    department: u.department,
    roles: (u.roles || []).map((r: any) => r.name),
    permissions: u.permissions || [],
  });

  const handleLogin = async (e?: React.FormEvent, quickUser?: string, quickPass?: string) => {
    if (e) e.preventDefault();
    const uname = quickUser ?? loginUsername;
    const upass = quickPass ?? loginPassword;
    setLoggingIn(true);
    setLoginError(null);

    try {
      const formBody = new URLSearchParams();
      formBody.append('username', uname);
      formBody.append('password', upass);

      const res = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLoginError(err.detail || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
        setLoggingIn(false);
        return;
      }

      const data = await res.json();
      const mappedUser = mapBackendUser(data.user);
      setAuthToken(data.access_token);
      setCurrentUser(mappedUser);

      // Route to appropriate initial portal view & tab based on permission list (never group name)
      const perms = mappedUser.permissions || [];
      const isAdminOnly =
        perms.includes('admin:users') &&
        !perms.includes('encounter:sign') &&
        !perms.includes('triage:write') &&
        !perms.includes('medication:dispense') &&
        !perms.includes('lab:result_write') &&
        !perms.includes('queue:manage');
      const canViewClinical =
        !isAdminOnly && checkRequiredPermissions(perms, ['patient:read']).allowed;
      setPortalView(canViewClinical ? 'clinical' : 'admin-master');

      if (perms.includes('encounter:sign')) {
        setActiveWorkspaceTab('doctor-opd');
      } else if (perms.includes('lab:result_write')) {
        setActiveWorkspaceTab('lab-lis');
      } else if (perms.includes('medication:dispense')) {
        setActiveWorkspaceTab('pharmacy-dispense');
      } else if (perms.includes('triage:write') || perms.includes('queue:manage')) {
        setActiveWorkspaceTab('reception-triage');
      }
    } catch {
      setLoginError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ยืนยันตัวตน (http://localhost:8000) ได้');
    } finally {
      setLoggingIn(false);
    }
  };

  const refreshCurrentUserProfile = async () => {
    if (!authToken) return;
    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const u = await res.json();
        setCurrentUser(mapBackendUser(u));
      }
    } catch {
      // Ignore
    }
  };

  // Fetch active module manifests and initial OPD queue from Core API
  useEffect(() => {
    async function initShell() {
      try {
        const res = await fetch('http://localhost:8000/api/v1/modules/active-manifests');
        if (res.ok) {
          const data: ModuleManifest[] = await res.json();
          if (data && data.length > 0) {
            const merged = [...data];
            if (!merged.some((m) => m.id === 'reception-triage')) {
              merged.unshift(fallbackReceptionTriageManifest);
            }
            if (!merged.some((m) => m.id === 'lab-lis')) {
              merged.push(fallbackLabLisManifest);
            }
            if (!merged.some((m) => m.id === 'pharmacy-dispense')) {
              merged.push(fallbackPharmacyManifest);
            }
            setActiveModules(merged);
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
      user: currentUser || undefined,
      authToken,
      activeModules,
      activeWorkspaceTab,
      setActiveWorkspaceTab,
      emitEvent,
      onEvent,
    }),
    [patient, encounter, currentUser, authToken, activeModules, activeWorkspaceTab, emitEvent, onEvent]
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

  const workspaceTabs = resolveSlotComponents('patient-workspace-tab', activeModules);

  // ============================================================================
  // MANDATORY LOGIN GATE (No unauthenticated clinical access)
  // ============================================================================
  if (!currentUser || !authToken) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
        <div className="max-w-4xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Left Form */}
          <div className="md:col-span-6 p-8 space-y-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white text-xl font-bold shadow">
                🧬
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Organella HIS Portal</h1>
                <p className="text-xs text-slate-500">
                  ระบบยืนยันตัวตนตามรายการสิทธิ์ (Role-List Access Control)
                </p>
              </div>
            </div>

            {loginError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                ⚠️ {loginError}
              </div>
            )}

            <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ชื่อผู้ใช้งาน (Username)
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รหัสผ่าน (Password)
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl shadow transition-colors"
              >
                {loggingIn ? 'กำลังตรวจสอบสิทธิ์...' : '🔐 เข้าสู่ระบบด้วย JWT'}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">กฎความปลอดภัยเวชระเบียน (Clinical Safety):</p>
              <p>
                • ตรวจสอบสิทธิ์จาก <strong>Role List ที่ต้องใช้ในแต่ละหน้า</strong> (ไม่ตรวจจากชื่อ Group)
              </p>
              <p>• ป้องกันการบันทึกหรือสั่งยาแทนแพทย์อย่างเคร่งครัด</p>
            </div>
          </div>

          {/* Right Quick Role Selector for Testing */}
          <div className="md:col-span-6 bg-slate-50 p-8 border-l border-slate-200 space-y-3">
            <h2 className="text-sm font-bold text-slate-800">
              ⚡ คลิกเลือกบัญชีทดสอบตามบทบาทโรงพยาบาล (6 Roles)
            </h2>
            <p className="text-xs text-slate-500">
              คลิกที่บัญชีด้านล่างเพื่อเข้าสู่ระบบและทดสอบการกั้นสิทธิ์ในแต่ละหน้าได้ทันที:
            </p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => {
                    setLoginUsername(acc.username);
                    setLoginPassword(acc.password);
                    handleLogin(undefined, acc.username, acc.password);
                  }}
                  className="w-full text-left p-3 rounded-xl bg-white hover:bg-teal-50/50 border border-slate-200 hover:border-teal-400 transition-all shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{acc.title}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${acc.badge}`}>
                      {acc.username}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{acc.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeViewConfig = PORTAL_VIEWS.find((v) => v.id === portalView)!;
  const activeViewPermCheck = checkRequiredPermissions(
    currentUser.permissions,
    activeViewConfig.requiredRoles
  );

  return (
    <OrganellaContext.Provider value={contextValue}>
      <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-sm sticky top-0 z-50">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              🧬
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Organella</h1>
                <span className="text-[10px] font-semibold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-200">
                  Role-List RBAC & Master Data (Phase 3.5)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                สิทธิ์ที่ได้รับจริง: <span className="font-mono font-semibold text-teal-700">{currentUser.permissions.length} สิทธิ์ย่อย</span> | กลุ่ม: {currentUser.roles.join(', ') || 'Direct Only'}
              </p>
            </div>
          </div>

          {/* Portal Switcher Navigation */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {PORTAL_VIEWS.map((view) => {
              const check = checkRequiredPermissions(currentUser.permissions, view.requiredRoles);
              const isSelected = portalView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setPortalView(view.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1 ${
                    isSelected
                      ? 'bg-white text-teal-700 shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{view.label}</span>
                  {!check.allowed && <span className="text-[10px] text-red-600">🔒</span>}
                </button>
              );
            })}
          </div>

          {/* Authenticated User Info & Logout */}
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-900">{currentUser.fullName}</p>
              <p className="text-[11px] text-slate-500">
                {currentUser.department || '-'} {currentUser.licenseNumber ? `| ${currentUser.licenseNumber}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAuthToken('');
                setCurrentUser(null);
              }}
              className="text-xs bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 px-3 py-1.5 rounded-lg font-semibold transition-colors"
            >
              สลับผู้ใช้ / ออกจากระบบ
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* If user selects a top-level view where they lack requiredRoles, display exact missing roles */}
          {!activeViewPermCheck.allowed ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-xs text-red-900 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">
                  🚫 ปฏิเสธการเข้าถึงหน้านี้ (Missing Required Role List)
                </h3>
                <span className="font-mono bg-red-100 text-red-800 px-2.5 py-1 rounded border border-red-300 font-bold">
                  Access Denied
                </span>
              </div>
              <p>{activeViewPermCheck.errorMessage}</p>
              <div className="bg-white p-4 rounded-xl border border-red-200 space-y-2">
                <p className="font-semibold text-slate-700">
                  รายการสิทธิ์ที่หน้านี้ต้องการ (Required Role List):
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeViewPermCheck.requiredRoles.map((r) => {
                    const missing = activeViewPermCheck.missingRoles.includes(r);
                    return (
                      <span
                        key={r}
                        className={`font-mono px-2.5 py-1 rounded border font-bold ${
                          missing
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        {missing ? `✗ ขาดสิทธิ์: ${r}` : `✓ มีสิทธิ์: ${r}`}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : portalView === 'admin-master' ? (
            <AdminMasterDataConsole
              user={currentUser}
              authToken={authToken}
              onUserPermissionsUpdated={refreshCurrentUserProfile}
            />
          ) : (
            <>
              {/* If in Host Shell Preview Mode, show prominent Read-Only Guard Banner */}
              {portalView === 'host-preview' && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm">
                      👁️ โหมดดูตัวอย่างโมดูลใน Host Shell (Read-Only Module Preview Mode)
                    </p>
                    <p className="mt-0.5">
                      ตามกฎความปลอดภัยเวชระเบียน การเปิดดูจาก Host Shell Preview จะถูกบังคับเป็น{' '}
                      <code>readonly=true</code> เสมอ เพื่อป้องกันไม่ให้มีการบันทึกหรือสั่งการรักษาแทนแพทย์
                    </p>
                  </div>
                  <span className="font-mono font-bold bg-amber-200 text-amber-900 px-3 py-1 rounded">
                    STRICT READ-ONLY
                  </span>
                </div>
              )}

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
                    </div>

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
                              readonly={portalView === 'host-preview'}
                            />
                          </SlotErrorBoundary>
                        );
                      })}
                    </div>
                  </div>

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
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <div className="border-b border-slate-100 pb-2 mb-3 flex items-center justify-between">
                      <h3 className="font-bold text-slate-800 text-sm">
                        คิวรอตรวจ (คลิกเพื่อสลับผู้ป่วย)
                      </h3>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">
                        slot: dashboard-widget
                      </span>
                    </div>
                    <DynamicSlot slotId="dashboard-widget" />
                  </div>

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
            </>
          )}
        </main>
      </div>
    </OrganellaContext.Provider>
  );
}

export default App;
