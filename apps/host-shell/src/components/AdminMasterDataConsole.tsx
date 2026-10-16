import React, { useEffect, useState } from 'react';
import { checkRequiredPermissions, OrganellaUser } from '@organella/sdk';

interface PermissionItem {
  id: string;
  name: string;
  group_name: string;
  description?: string;
}

interface PermissionGroup {
  group_name: string;
  permissions: PermissionItem[];
}

interface RoleItem {
  id: string;
  name: string;
  description?: string;
  permissions: PermissionItem[];
}

interface UserRecord {
  id: string;
  username: string;
  email: string;
  full_name: string;
  license_number?: string;
  department?: string;
  is_active: boolean;
  roles: RoleItem[];
  direct_permissions: PermissionItem[];
  permissions: string[];
}

interface Props {
  user: OrganellaUser;
  authToken: string;
  onUserPermissionsUpdated?: () => void;
}

type ConsoleTabId = 'rbac' | 'icd10' | 'medications' | 'patients' | 'audit';

const CONSOLE_TABS: Array<{
  id: ConsoleTabId;
  label: string;
  requiredRoles: string[];
}> = [
  {
    id: 'rbac',
    label: '🔐 ตั้งค่าสิทธิ์ผู้ใช้ (Group & รายสิทธิ์)',
    requiredRoles: ['admin:users'],
  },
  {
    id: 'icd10',
    label: '📘 ฐานข้อมูลรหัสโรค ICD-10 & นำเข้า',
    requiredRoles: ['masterdata:icd10'],
  },
  {
    id: 'medications',
    label: '💊 บัญชียาโรงพยาบาล (Formulary) & นำเข้า',
    requiredRoles: ['masterdata:medications'],
  },
  {
    id: 'patients',
    label: '🗂️ นำเข้าทะเบียนผู้ป่วย (MPI Import)',
    requiredRoles: ['masterdata:patients'],
  },
  {
    id: 'audit',
    label: '🛡️ ตรวจสอบ PDPA Audit Logs',
    requiredRoles: ['audit:read'],
  },
];

export const AdminMasterDataConsole: React.FC<Props> = ({
  user,
  authToken,
  onUserPermissionsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<ConsoleTabId>('rbac');
  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'error';
    text: string;
    missingRoles?: string[];
  } | null>(null);

  // RBAC state
  const [permGroups, setPermGroups] = useState<PermissionGroup[]>([]);
  const [rolesCatalog, setRolesCatalog] = useState<RoleItem[]>([]);
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRoleNames, setSelectedRoleNames] = useState<string[]>([]);
  const [selectedDirectPerms, setSelectedDirectPerms] = useState<string[]>([]);
  const [editLicense, setEditLicense] = useState<string>('');
  const [editDept, setEditDept] = useState<string>('');

  // ICD-10 Master state
  const [icdList, setIcdList] = useState<any[]>([]);
  const [icdQuery, setIcdQuery] = useState<string>('');
  const [icdCsv, setIcdCsv] = useState<string>(
    `code,display_en,display_th,category\nJ01.9,Acute sinusitis unspecified,ไซนัสอักเสบเฉียบพลัน,Respiratory\nJ20.9,Acute bronchitis unspecified,หลอดลมอักเสบเฉียบพลัน,Respiratory\nN39.0,Urinary tract infection site not specified,ติดเชื้อทางเดินปัสสาวะ (UTI),Genitourinary`
  );
  const [newIcd, setNewIcd] = useState({
    code: '',
    display_en: '',
    display_th: '',
    category: 'General',
  });

  // Medications Master state
  const [medList, setMedList] = useState<any[]>([]);
  const [medQuery, setMedQuery] = useState<string>('');
  const [medCsv, setMedCsv] = useState<string>(
    `code,generic_name,trade_name,strength,dosage_form,default_dosage,unit,drug_allergy_class\nRX-LORA-10,Loratadine,Clarityne,10 mg,tablet,รับประทานครั้งละ 1 เม็ด วันละ 1 ครั้ง,tablet,\nRX-DICL-25,Diclofenac,Voltaren,25 mg,tablet,รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหารทันที,tablet,NSAIDs\nRX-COTR-480,Co-trimoxazole,Bactrim,480 mg,tablet,รับประทานครั้งละ 2 เม็ด วันละ 2 ครั้ง เช้า-เย็น,tablet,Sulfa`
  );
  const [newMed, setNewMed] = useState({
    code: '',
    generic_name: '',
    strength: '',
    default_dosage: 'รับประทานครั้งละ 1 เม็ด หลังอาหาร',
    unit: 'tablet',
    drug_allergy_class: '',
  });

  // MPI Patient Bulk Import state
  const [patientCsv, setPatientCsv] = useState<string>(
    `hn,citizen_id,prefix,first_name,last_name,gender,birth_date,blood_group,allergies\nHN-2026-0004,1100500998877,นาง,พรทิพย์,เจริญสุข,female,1975-03-19,A+,Penicillin|Ibuprofen\nHN-2026-0005,3100200334455,นาย,ธีรพงศ์,สายชล,male,1992-07-10,O+,`
  );

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };

  // Auto-select first allowed tab on mount
  useEffect(() => {
    const firstAllowed = CONSOLE_TABS.find(
      (t) => checkRequiredPermissions(user.permissions, t.requiredRoles).allowed
    );
    if (firstAllowed) {
      setActiveTab(firstAllowed.id);
    }
  }, [user.id]);

  // Load RBAC data
  const fetchRbacData = async () => {
    try {
      const [grpRes, roleRes, usrRes] = await Promise.all([
        fetch('http://localhost:8000/api/v1/auth/permissions/grouped'),
        fetch('http://localhost:8000/api/v1/auth/roles'),
        fetch('http://localhost:8000/api/v1/auth/users', { headers: authHeaders }),
      ]);
      if (grpRes.ok) setPermGroups(await grpRes.json());
      if (roleRes.ok) setRolesCatalog(await roleRes.json());
      if (usrRes.ok) {
        const users: UserRecord[] = await usrRes.json();
        setUsersList(users);
        if (users.length > 0 && !selectedUserId) {
          selectUserForEditing(users[0]);
        } else if (selectedUserId) {
          const updated = users.find((u) => u.id === selectedUserId);
          if (updated) selectUserForEditing(updated);
        }
      }
    } catch {
      // Ignore fetch errors when offline
    }
  };

  const selectUserForEditing = (u: UserRecord) => {
    setSelectedUserId(u.id);
    setSelectedRoleNames(u.roles.map((r) => r.name));
    setSelectedDirectPerms((u.direct_permissions || []).map((p) => p.name));
    setEditLicense(u.license_number || '');
    setEditDept(u.department || '');
    setStatusMsg(null);
  };

  const fetchIcd10 = async (q = icdQuery) => {
    const res = await fetch(
      `http://localhost:8000/api/v1/master-data/icd10?q=${encodeURIComponent(q)}`
    );
    if (res.ok) setIcdList(await res.json());
  };

  const fetchMedications = async (q = medQuery) => {
    const res = await fetch(
      `http://localhost:8000/api/v1/master-data/medications?q=${encodeURIComponent(q)}`
    );
    if (res.ok) setMedList(await res.json());
  };

  const fetchAuditLogs = async () => {
    const res = await fetch('http://localhost:8000/api/v1/master-data/audit-logs', {
      headers: authHeaders,
    });
    if (res.ok) setAuditLogs(await res.json());
  };

  useEffect(() => {
    setStatusMsg(null);
    if (activeTab === 'rbac') fetchRbacData();
    if (activeTab === 'icd10') fetchIcd10();
    if (activeTab === 'medications') fetchMedications();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab]);

  // Compute permissions inherited from selected Role Groups
  const roleInheritedPerms = new Set<string>();
  rolesCatalog
    .filter((r) => selectedRoleNames.includes(r.name))
    .forEach((r) => r.permissions.forEach((p) => roleInheritedPerms.add(p.name)));

  const effectivePreviewPerms = new Set<string>([
    ...Array.from(roleInheritedPerms),
    ...selectedDirectPerms,
  ]);

  const toggleRoleGroupPreset = (roleName: string) => {
    setSelectedRoleNames((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );
  };

  const toggleDirectPerm = (permName: string) => {
    setSelectedDirectPerms((prev) =>
      prev.includes(permName) ? prev.filter((p) => p !== permName) : [...prev, permName]
    );
  };

  const toggleEntireCategoryGroup = (group: PermissionGroup) => {
    const groupPermNames = group.permissions.map((p) => p.name);
    const allSelected = groupPermNames.every((p) => selectedDirectPerms.includes(p));
    if (allSelected) {
      setSelectedDirectPerms((prev) => prev.filter((p) => !groupPermNames.includes(p)));
    } else {
      setSelectedDirectPerms((prev) => Array.from(new Set([...prev, ...groupPermNames])));
    }
  };

  const handleSaveUserPermissions = async () => {
    if (!selectedUserId) return;
    setStatusMsg(null);
    const res = await fetch(
      `http://localhost:8000/api/v1/auth/users/${selectedUserId}/permissions`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          role_names: selectedRoleNames,
          direct_permission_names: selectedDirectPerms,
          license_number: editLicense || null,
          department: editDept || null,
        }),
      }
    );
    if (res.ok) {
      const updatedUser: UserRecord = await res.json();
      setStatusMsg({
        type: 'success',
        text: `บันทึกสิทธิ์ของ ${updatedUser.full_name} สำเร็จ! (รวม ${updatedUser.permissions.length} สิทธิ์ย่อย)`,
      });
      fetchRbacData();
      if (onUserPermissionsUpdated) onUserPermissionsUpdated();
    } else {
      const err = await res.json().catch(() => ({}));
      const detail = err.detail;
      setStatusMsg({
        type: 'error',
        text: typeof detail === 'object' ? detail.message : detail || 'บันทึกสิทธิ์ไม่สำเร็จ',
        missingRoles: typeof detail === 'object' ? detail.missing_roles : undefined,
      });
    }
  };

  const handleAddSingleIcd10 = async () => {
    if (!newIcd.code || !newIcd.display_en) return;
    const res = await fetch('http://localhost:8000/api/v1/master-data/icd10', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(newIcd),
    });
    if (res.ok) {
      setStatusMsg({ type: 'success', text: `เพิ่ม/อัปเดตรหัสโรค ${newIcd.code} สำเร็จ` });
      setNewIcd({ code: '', display_en: '', display_th: '', category: 'General' });
      fetchIcd10();
    }
  };

  const handleImportIcd10Csv = async () => {
    const res = await fetch('http://localhost:8000/api/v1/master-data/icd10/import', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ csv_text: icdCsv }),
    });
    if (res.ok) {
      const data = await res.json();
      setStatusMsg({
        type: 'success',
        text: `นำเข้าข้อมูล ICD-10 สำเร็จ: เพิ่มใหม่ ${data.imported_count} รายการ, อัปเดต ${data.updated_count} รายการ`,
      });
      fetchIcd10();
    }
  };

  const handleAddSingleMedication = async () => {
    if (!newMed.code || !newMed.generic_name) return;
    const res = await fetch('http://localhost:8000/api/v1/master-data/medications', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(newMed),
    });
    if (res.ok) {
      setStatusMsg({ type: 'success', text: `เพิ่ม/อัปเดตรายการยา ${newMed.generic_name} สำเร็จ` });
      setNewMed({
        code: '',
        generic_name: '',
        strength: '',
        default_dosage: 'รับประทานครั้งละ 1 เม็ด หลังอาหาร',
        unit: 'tablet',
        drug_allergy_class: '',
      });
      fetchMedications();
    }
  };

  const handleImportMedicationsCsv = async () => {
    const res = await fetch('http://localhost:8000/api/v1/master-data/medications/import', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ csv_text: medCsv }),
    });
    if (res.ok) {
      const data = await res.json();
      setStatusMsg({
        type: 'success',
        text: `นำเข้าบัญชียาสำเร็จ: เพิ่มใหม่ ${data.imported_count} รายการ, อัปเดต ${data.updated_count} รายการ`,
      });
      fetchMedications();
    }
  };

  const handleImportPatientsCsv = async () => {
    const res = await fetch('http://localhost:8000/api/v1/master-data/patients/import', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ csv_text: patientCsv }),
    });
    if (res.ok) {
      const data = await res.json();
      setStatusMsg({
        type: 'success',
        text: `นำเข้าทะเบียนผู้ป่วย (MPI) สำเร็จ: เพิ่มใหม่ ${data.imported_count} ราย, อัปเดต ${data.updated_count} ราย`,
      });
    }
  };

  const currentTabConfig = CONSOLE_TABS.find((t) => t.id === activeTab)!;
  const tabPermCheck = checkRequiredPermissions(user.permissions, currentTabConfig.requiredRoles);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Sub-navigation Tabs */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 pt-3 flex flex-wrap gap-2">
        {CONSOLE_TABS.map((t) => {
          const check = checkRequiredPermissions(user.permissions, t.requiredRoles);
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg border-t border-x -mb-[1px] flex items-center space-x-1.5 ${
                isActive
                  ? 'bg-white border-slate-200 text-teal-700 shadow-sm'
                  : 'border-transparent text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{t.label}</span>
              {!check.allowed && (
                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono">
                  🔒
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-6 space-y-5">
        {/* Status Message */}
        {statusMsg && (
          <div
            className={`p-3.5 rounded-xl border text-xs ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            <p className="font-semibold">{statusMsg.text}</p>
            {statusMsg.missingRoles && (
              <p className="font-mono mt-1 text-red-700">
                Missing Required Roles: [{statusMsg.missingRoles.join(', ')}]
              </p>
            )}
          </div>
        )}

        {/* Role-List Access Denied Screen if current user lacks requiredRoles for this tab */}
        {!tabPermCheck.allowed ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm">
                🚫 ปฏิเสธการเข้าถึงหน้านี้ (Role-List Permission Check Failed)
              </h4>
              <span className="font-mono text-[11px] bg-red-100 px-2.5 py-1 rounded border border-red-300 font-bold">
                HTTP 403 Policy
              </span>
            </div>
            <p>{tabPermCheck.errorMessage}</p>
            <div className="bg-white p-3 rounded-lg border border-red-200 space-y-1.5">
              <p className="font-semibold text-slate-700">
                การตรวจสอบสิทธิ์ของหน้านี้ (ตรวจจาก Role List ที่ต้องใช้ ไม่ตรวจจากชื่อ Group):
              </p>
              <div className="flex flex-wrap gap-2">
                {tabPermCheck.requiredRoles.map((reqRole) => {
                  const isMissing = tabPermCheck.missingRoles.includes(reqRole);
                  return (
                    <span
                      key={reqRole}
                      className={`font-mono px-2.5 py-1 rounded border font-bold ${
                        isMissing
                          ? 'bg-red-100 text-red-800 border-red-300'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      {isMissing ? `✗ ขาดสิทธิ์: ${reqRole}` : `✓ มีสิทธิ์: ${reqRole}`}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ============================================================
                TAB 1: USER & GRANULAR GROUP/ITEM PERMISSION SETTINGS
               ============================================================ */}
            {activeTab === 'rbac' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Users List */}
                <div className="lg:col-span-4 space-y-3">
                  <h4 className="font-bold text-slate-800 text-sm">
                    1. เลือกผู้ใช้งาน (1 User มีได้หลายสิทธิ์)
                  </h4>
                  <div className="space-y-2">
                    {usersList.map((u) => {
                      const isSel = u.id === selectedUserId;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => selectUserForEditing(u)}
                          className={`w-full text-left p-3 rounded-xl border text-xs transition-all ${
                            isSel
                              ? 'bg-teal-50 border-teal-500 ring-1 ring-teal-500 shadow-sm'
                              : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{u.full_name}</span>
                            <span className="font-mono text-[11px] text-teal-700 font-semibold">
                              @{u.username}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {u.department || '-'} {u.license_number ? `• ${u.license_number}` : ''}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {u.roles.map((r) => (
                              <span
                                key={r.name}
                                className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-semibold"
                              >
                                Group: {r.name}
                              </span>
                            ))}
                            {u.direct_permissions && u.direct_permissions.length > 0 && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold">
                                +{u.direct_permissions.length} รายสิทธิ์ย่อย
                              </span>
                            )}
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">
                              รวม {u.permissions.length} สิทธิ์
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Multi-Group & Individual Permission Matrix */}
                <div className="lg:col-span-8 space-y-5">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">
                        2. เลือกกลุ่มบทบาท (Preset Role Groups) — เลือกได้มากกว่า 1 กลุ่ม
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        รวมสิทธิ์ที่ได้รับทั้งหมด:{' '}
                        <strong className="text-teal-700">{effectivePreviewPerms.size}</strong> สิทธิ์
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {rolesCatalog.map((role) => {
                        const checked = selectedRoleNames.includes(role.name);
                        return (
                          <label
                            key={role.name}
                            className={`flex items-start space-x-2 p-2.5 rounded-lg border text-xs cursor-pointer ${
                              checked
                                ? 'bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRoleGroupPreset(role.name)}
                              className="mt-0.5 rounded text-indigo-600"
                            />
                            <div>
                              <span className="block font-bold">{role.name}</span>
                              <span className="text-[10px] text-slate-500">
                                ({role.permissions.length} สิทธิ์ในกลุ่มนี้)
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          เลขใบประกอบวิชาชีพ (ว. / พย. / ภ.):
                        </label>
                        <input
                          type="text"
                          value={editLicense}
                          onChange={(e) => setEditLicense(e.target.value)}
                          placeholder="เช่น ว.45892"
                          className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          แผนก / หน่วยงาน (Department):
                        </label>
                        <input
                          type="text"
                          value={editDept}
                          onChange={(e) => setEditDept(e.target.value)}
                          className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Granular Permissions Grouped by Category */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900 text-sm">
                        3. ตั้งค่าสิทธิ์แบบแยกตามหมวดหมู่ (เลือกทั้งหมวด Group หรือเลือกรายสิทธิ์ย่อยได้)
                      </h4>
                    </div>

                    <div className="space-y-3">
                      {permGroups.map((grp) => {
                        const allDirectSelected = grp.permissions.every((p) =>
                          selectedDirectPerms.includes(p.name)
                        );
                        return (
                          <div
                            key={grp.group_name}
                            className="border border-slate-200 rounded-xl overflow-hidden bg-white"
                          >
                            <div className="bg-slate-100 px-4 py-2.5 flex items-center justify-between border-b border-slate-200">
                              <span className="font-bold text-xs text-slate-800">
                                📁 {grp.group_name}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleEntireCategoryGroup(grp)}
                                className="text-[11px] bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 px-2.5 py-1 rounded-md font-semibold shadow-sm"
                              >
                                {allDirectSelected
                                  ? '✓ ยกเลิกทั้งหมวดนี้ (Clear Group)'
                                  : '+ เลือกทั้งหมวดนี้ (Select Entire Group)'}
                              </button>
                            </div>

                            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {grp.permissions.map((perm) => {
                                const fromRole = roleInheritedPerms.has(perm.name);
                                const fromDirect = selectedDirectPerms.includes(perm.name);
                                const isEffective = fromRole || fromDirect;

                                return (
                                  <label
                                    key={perm.name}
                                    className={`flex items-start space-x-2 p-2 rounded-lg border text-xs cursor-pointer ${
                                      isEffective
                                        ? 'bg-emerald-50/70 border-emerald-300'
                                        : 'bg-slate-50/50 border-slate-200'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={fromDirect || fromRole}
                                      onChange={() => toggleDirectPerm(perm.name)}
                                      className="mt-0.5 rounded text-teal-600"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="font-mono font-bold text-slate-900">
                                          {perm.name}
                                        </span>
                                        {fromRole && (
                                          <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-semibold">
                                            จาก Group
                                          </span>
                                        )}
                                        {fromDirect && (
                                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                                            รายสิทธิ์
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-slate-500 mt-0.5">
                                        {perm.description}
                                      </p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveUserPermissions}
                        className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                      >
                        💾 บันทึกการตั้งค่าสิทธิ์ของผู้ใช้งานรายนี้
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================
                TAB 2: ICD-10 MASTER DATA & BULK IMPORT
               ============================================================ */}
            {activeTab === 'icd10' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-slate-800 text-sm">
                      รายการรหัสโรคมาตรฐาน ICD-10 ในฐานข้อมูล ({icdList.length} รหัส)
                    </h4>
                    <input
                      type="text"
                      value={icdQuery}
                      onChange={(e) => {
                        setIcdQuery(e.target.value);
                        fetchIcd10(e.target.value);
                      }}
                      placeholder="🔍 ค้นหารหัส หรือชื่อโรค..."
                      className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg w-56"
                    />
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">รหัส ICD-10</th>
                          <th className="py-2 px-3">ชื่อโรค (EN / TH)</th>
                          <th className="py-2 px-3">หมวดหมู่</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {icdList.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                              {item.code}
                            </td>
                            <td className="py-2 px-3 text-slate-800">{item.display}</td>
                            <td className="py-2 px-3 text-slate-500">{item.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                    <h5 className="font-bold text-xs text-slate-800">
                      ➕ เพิ่ม/แก้ไขรหัสโรค ICD-10 รายรหัส
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="รหัส เช่น J03.9"
                        value={newIcd.code}
                        onChange={(e) => setNewIcd({ ...newIcd, code: e.target.value })}
                        className="text-xs px-2.5 py-1.5 border rounded-lg bg-white"
                      />
                      <input
                        type="text"
                        placeholder="หมวดหมู่ (เช่น Respiratory)"
                        value={newIcd.category}
                        onChange={(e) => setNewIcd({ ...newIcd, category: e.target.value })}
                        className="text-xs px-2.5 py-1.5 border rounded-lg bg-white"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="ชื่อภาษาอังกฤษ (เช่น Acute tonsillitis)"
                      value={newIcd.display_en}
                      onChange={(e) => setNewIcd({ ...newIcd, display_en: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white"
                    />
                    <input
                      type="text"
                      placeholder="ชื่อภาษาไทย (เช่น ทอนซิลอักเสบเฉียบพลัน)"
                      value={newIcd.display_th}
                      onChange={(e) => setNewIcd({ ...newIcd, display_th: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddSingleIcd10}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
                    >
                      บันทึกรหัสโรค ICD-10
                    </button>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                    <h5 className="font-bold text-xs text-slate-800">
                      📥 นำเข้ารหัสโรค ICD-10 แบบกลุ่ม (CSV Bulk Import)
                    </h5>
                    <textarea
                      value={icdCsv}
                      onChange={(e) => setIcdCsv(e.target.value)}
                      className="w-full text-[11px] font-mono p-2.5 border rounded-lg bg-white min-h-[110px]"
                    />
                    <button
                      type="button"
                      onClick={handleImportIcd10Csv}
                      className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg"
                    >
                      นำเข้าข้อมูล CSV เข้าสู่ฐานข้อมูล ICD-10
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================
                TAB 3: DRUG FORMULARY MASTER DATA & BULK IMPORT
               ============================================================ */}
            {activeTab === 'medications' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-slate-800 text-sm">
                      บัญชียาโรงพยาบาล (Hospital Drug Formulary: {medList.length} รายการ)
                    </h4>
                    <input
                      type="text"
                      value={medQuery}
                      onChange={(e) => {
                        setMedQuery(e.target.value);
                        fetchMedications(e.target.value);
                      }}
                      placeholder="🔍 ค้นหาชื่อยา หรือกลุ่มแพ้ยา..."
                      className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg w-56"
                    />
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">รหัสยา</th>
                          <th className="py-2 px-3">ชื่อยาและขนาด</th>
                          <th className="py-2 px-3">กลุ่มยาแพ้ (Allergy Class)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {medList.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono font-bold text-teal-700">{m.code}</td>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-800">{m.display_name}</div>
                              <div className="text-[11px] text-slate-500">{m.default_dosage}</div>
                            </td>
                            <td className="py-2 px-3">
                              {m.drug_allergy_class ? (
                                <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  ⚠️ {m.drug_allergy_class}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                    <h5 className="font-bold text-xs text-slate-800">➕ เพิ่มรายการยาใหม่เข้าบัญชียา</h5>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="รหัสยา เช่น RX-AZIT-250"
                        value={newMed.code}
                        onChange={(e) => setNewMed({ ...newMed, code: e.target.value })}
                        className="text-xs px-2.5 py-1.5 border rounded-lg bg-white"
                      />
                      <input
                        type="text"
                        placeholder="ขนาด เช่น 250 mg"
                        value={newMed.strength}
                        onChange={(e) => setNewMed({ ...newMed, strength: e.target.value })}
                        className="text-xs px-2.5 py-1.5 border rounded-lg bg-white"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="ชื่อสามัญทางยา (Generic Name) เช่น Azithromycin"
                      value={newMed.generic_name}
                      onChange={(e) => setNewMed({ ...newMed, generic_name: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white"
                    />
                    <input
                      type="text"
                      placeholder="วิธีใช้มาตรฐาน (Default Sig)"
                      value={newMed.default_dosage}
                      onChange={(e) => setNewMed({ ...newMed, default_dosage: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white"
                    />
                    <input
                      type="text"
                      placeholder="กลุ่มแพ้ยา (เช่น Penicillin, NSAIDs, Sulfa)"
                      value={newMed.drug_allergy_class}
                      onChange={(e) => setNewMed({ ...newMed, drug_allergy_class: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddSingleMedication}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
                    >
                      บันทึกรายการยา
                    </button>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                    <h5 className="font-bold text-xs text-slate-800">
                      📥 นำเข้าบัญชียาแบบกลุ่ม (CSV Bulk Import)
                    </h5>
                    <textarea
                      value={medCsv}
                      onChange={(e) => setMedCsv(e.target.value)}
                      className="w-full text-[11px] font-mono p-2.5 border rounded-lg bg-white min-h-[110px]"
                    />
                    <button
                      type="button"
                      onClick={handleImportMedicationsCsv}
                      className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg"
                    >
                      นำเข้าข้อมูล CSV เข้าสู่บัญชียาโรงพยาบาล
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================
                TAB 4: MPI PATIENT BULK IMPORT
               ============================================================ */}
            {activeTab === 'patients' && (
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-sm">
                  📥 นำเข้าทะเบียนผู้ป่วย (Master Patient Index CSV Bulk Import)
                </h4>
                <p className="text-xs text-slate-500">
                  รองรับการนำเข้ารายชื่อผู้ป่วย ประวัติแพ้ยา (คั่นด้วยเครื่องหมาย <code>|</code>) และเลขบัตรประชาชนเข้าสู่ระบบ MPI โดยตรง
                </p>
                <textarea
                  value={patientCsv}
                  onChange={(e) => setPatientCsv(e.target.value)}
                  className="w-full text-xs font-mono p-3 border border-slate-300 rounded-xl bg-slate-50 min-h-[140px]"
                />
                <button
                  type="button"
                  onClick={handleImportPatientsCsv}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  นำเข้ารายชื่อผู้ป่วยเข้าสู่ฐานข้อมูล MPI
                </button>
              </div>
            )}

            {/* ============================================================
                TAB 5: PDPA / HIPAA AUDIT LOGS
               ============================================================ */}
            {activeTab === 'audit' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-sm">
                    🛡️ บันทึกการตรวจสอบสิทธิ์และการปฏิบัติงาน (PDPA / HIPAA Audit Trail)
                  </h4>
                  <button
                    type="button"
                    onClick={fetchAuditLogs}
                    className="text-xs text-teal-600 font-semibold hover:underline"
                  >
                    ↻ รีเฟรชข้อมูลล่าสุด
                  </button>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">เวลา</th>
                        <th className="py-2 px-3">Action</th>
                        <th className="py-2 px-3">ผู้ดำเนินการ</th>
                        <th className="py-2 px-3">Resource</th>
                        <th className="py-2 px-3">รายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-teal-700">
                            {log.action}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {log.user_name || '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {log.resource_type} ({log.resource_id || '-'})
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 truncate max-w-xs">
                            {JSON.stringify(log.details)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminMasterDataConsole;
