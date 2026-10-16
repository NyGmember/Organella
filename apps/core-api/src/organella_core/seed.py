import asyncio
from typing import Dict, List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from organella_core.database import AsyncSessionLocal
from organella_core.models.auth import Permission, Role, User
from organella_core.models.master_data import MasterICD10, MasterMedication
from organella_core.security import get_password_hash

# (permission_name, group_name, description)
DEFAULT_PERMISSIONS: List[Tuple[str, str, str]] = [
    # Group 1: Patient & Queue
    (
        "patient:read",
        "1. ทะเบียนผู้ป่วยและคิว (Patient & Queue)",
        "ดูข้อมูลพื้นฐานผู้ป่วย (MPI) และประวัติแพ้ยา",
    ),
    (
        "patient:write",
        "1. ทะเบียนผู้ป่วยและคิว (Patient & Queue)",
        "ลงทะเบียนผู้ป่วยใหม่และแก้ไขข้อมูลผู้ป่วย",
    ),
    (
        "queue:manage",
        "1. ทะเบียนผู้ป่วยและคิว (Patient & Queue)",
        "ออกคิวตรวจผู้ป่วยนอก (OPD Queue) และจัดการสถานะคิว",
    ),
    # Group 2: Nursing & Triage
    (
        "triage:read",
        "2. การคัดกรองและสัญญาณชีพ (Nursing & Triage)",
        "ดูข้อมูลคัดกรองและสัญญาณชีพ (Vital Signs)",
    ),
    (
        "triage:write",
        "2. การคัดกรองและสัญญาณชีพ (Nursing & Triage)",
        "บันทึกอาการสำคัญแรกรับ (Chief Complaint) และวัดสัญญาณชีพ (Vital Signs)",
    ),
    # Group 3: Doctor Clinical Consultation
    (
        "encounter:read",
        "3. เวชระเบียนและการตรวจของแพทย์ (Doctor Consultation)",
        "เปิดอ่านเวชระเบียนการตรวจรักษา (SOAP Note)",
    ),
    (
        "encounter:write",
        "3. เวชระเบียนและการตรวจของแพทย์ (Doctor Consultation)",
        "ร่างบันทึกข้อมูลการตรวจรักษา (Draft Encounter)",
    ),
    (
        "encounter:sign",
        "3. เวชระเบียนและการตรวจของแพทย์ (Doctor Consultation)",
        "บันทึกและลงนามเวชระเบียนแพทย์ (Sign-off SOAP Note ด้วยเลข ว.)",
    ),
    (
        "condition:read",
        "3. เวชระเบียนและการตรวจของแพทย์ (Doctor Consultation)",
        "ดูรายการวินิจฉัยโรค (ICD-10)",
    ),
    (
        "condition:write",
        "3. เวชระเบียนและการตรวจของแพทย์ (Doctor Consultation)",
        "วินิจฉัยโรคและบันทึกรหัส ICD-10 (เฉพาะแพทย์)",
    ),
    # Group 4: Medication & Pharmacy
    (
        "medication:read",
        "4. การสั่งยาและห้องยา (Medication & Pharmacy)",
        "ดูรายการใบสั่งยา (e-Prescription)",
    ),
    (
        "medication:write",
        "4. การสั่งยาและห้องยา (Medication & Pharmacy)",
        "จัดการข้อมูลรายการยาเบื้องต้น",
    ),
    (
        "medication:prescribe",
        "4. การสั่งยาและห้องยา (Medication & Pharmacy)",
        "สั่งยาผู้ป่วยนอก (Prescribe Medications - เฉพาะแพทย์)",
    ),
    (
        "medication:dispense",
        "4. การสั่งยาและห้องยา (Medication & Pharmacy)",
        "ตรวจสอบใบสั่งยาและยืนยันการจ่ายยา (Dispense - เภสัชกร)",
    ),
    # Group 5: Master Data Management
    (
        "masterdata:icd10",
        "5. การจัดการข้อมูลหลัก (Master Data Management)",
        "นำเข้า (CSV/JSON) และจัดการฐานข้อมูลรหัสโรค ICD-10",
    ),
    (
        "masterdata:medications",
        "5. การจัดการข้อมูลหลัก (Master Data Management)",
        "นำเข้า (CSV/JSON) และจัดการบัญชียาโรงพยาบาล (Drug Formulary)",
    ),
    (
        "masterdata:patients",
        "5. การจัดการข้อมูลหลัก (Master Data Management)",
        "นำเข้าข้อมูลทะเบียนผู้ป่วยแบบกลุ่ม (Bulk MPI Import)",
    ),
    # Group 6: System Administration & Audit
    (
        "admin:users",
        "6. การดูแลระบบและตรวจสอบ (System Admin & Audit)",
        "จัดการบัญชีผู้ใช้งานและกำหนดสิทธิ์รายบุคคล",
    ),
    (
        "admin:roles",
        "6. การดูแลระบบและตรวจสอบ (System Admin & Audit)",
        "ตั้งค่ากลุ่มสิทธิ์ (Role Groups) และจัดการโครงสร้างสิทธิ์",
    ),
    (
        "admin:modules",
        "6. การดูแลระบบและตรวจสอบ (System Admin & Audit)",
        "ติดตั้ง เปิด/ปิดโมดูล และดูตัวอย่างโมดูลในโหมด Read-only",
    ),
    (
        "audit:read",
        "6. การดูแลระบบและตรวจสอบ (System Admin & Audit)",
        "ตรวจสอบประวัติการใช้งานระบบ (PDPA / HIPAA Audit Logs)",
    ),
]

INITIAL_ICD10_MASTER = [
    ("J00", "Acute nasopharyngitis [common cold]", "โรคหวัดเฉียบพลัน", "Respiratory"),
    ("J02.9", "Acute pharyngitis, unspecified", "คออักเสบเฉียบพลัน", "Respiratory"),
    (
        "J06.9",
        "Acute upper respiratory infection, unspecified",
        "ติดเชื้อทางเดินหายใจส่วนบนเฉียบพลัน",
        "Respiratory",
    ),
    ("I10", "Essential (primary) hypertension", "ความดันโลหิตสูงชนิดไม่ทราบสาเหตุ", "Cardiovascular"),
    (
        "E11.9",
        "Type 2 diabetes mellitus without complications",
        "เบาหวานชนิดที่ 2 ไม่มีภาวะแทรกซ้อน",
        "Endocrine & Metabolic",
    ),
    ("E78.5", "Hyperlipidaemia, unspecified", "ไขมันในเลือดสูง", "Endocrine & Metabolic"),
    (
        "K21.9",
        "Gastro-oesophageal reflux disease without oesophagitis",
        "กรดไหลย้อน (GERD)",
        "Gastrointestinal",
    ),
    ("K29.7", "Gastritis, unspecified", "กระเพาะอาหารอักเสบ", "Gastrointestinal"),
    (
        "A09",
        "Infectious gastroenteritis and colitis, unspecified",
        "ลำไส้อักเสบติดเชื้อ/ท้องร่วง",
        "Gastrointestinal",
    ),
    ("M54.5", "Low back pain", "ปวดหลังส่วนล่าง", "Musculoskeletal"),
    ("M79.1", "Myalgia", "ปวดกล้ามเนื้อ", "Musculoskeletal"),
    ("G43.9", "Migraine, unspecified", "ปวดศีรษะไมเกรน", "Neurological"),
    ("R50.9", "Fever, unspecified", "ไข้ไม่ทราบสาเหตุ", "Symptoms & Signs"),
    ("R51", "Headache", "อาการปวดศีรษะ", "Symptoms & Signs"),
    ("L20.9", "Atopic dermatitis, unspecified", "ผื่นภูมิแพ้ผิวหนัง", "Dermatology"),
]

INITIAL_MEDICATIONS_MASTER = [
    (
        "RX-PARA-500",
        "Paracetamol",
        "Tylenol",
        "500 mg",
        "tablet",
        "รับประทานครั้งละ 1 เม็ด ทุก 4-6 ชั่วโมง เวลาปวดหรือมีไข้",
        "tablet",
        None,
    ),
    (
        "RX-ROXI-150",
        "Roxithromycin",
        "Rulid",
        "150 mg",
        "tablet",
        "รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง ก่อนอาหารเช้า-เย็น",
        "tablet",
        "Macrolide",
    ),
    (
        "RX-AMOX-500",
        "Amoxicillin",
        "Amoxil",
        "500 mg",
        "capsule",
        "รับประทานครั้งละ 1 แคปซูล วันละ 3 ครั้ง หลังอาหารเช้า-กลางวัน-เย็น",
        "capsule",
        "Penicillin",
    ),
    (
        "RX-IBUP-400",
        "Ibuprofen",
        "Brufen",
        "400 mg",
        "tablet",
        "รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหารทันที",
        "tablet",
        "NSAIDs / Aspirin",
    ),
    (
        "RX-OMEP-20",
        "Omeprazole",
        "Miracid",
        "20 mg",
        "capsule",
        "รับประทานครั้งละ 1 แคปซูล วันละ 2 ครั้ง ก่อนอาหารเช้า-เย็น 30 นาที",
        "capsule",
        None,
    ),
    (
        "RX-CETI-10",
        "Cetirizine",
        "Zyrtec",
        "10 mg",
        "tablet",
        "รับประทานครั้งละ 1 เม็ด วันละ 1 ครั้ง ก่อนนอน",
        "tablet",
        None,
    ),
    (
        "RX-METF-500",
        "Metformin",
        "Glucophage",
        "500 mg",
        "tablet",
        "รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหารเช้า-เย็น",
        "tablet",
        None,
    ),
    (
        "RX-AMLO-5",
        "Amlodipine",
        "Norvasc",
        "5 mg",
        "tablet",
        "รับประทานครั้งละ 1 เม็ด วันละ 1 ครั้ง หลังอาหารเช้า",
        "tablet",
        None,
    ),
]


async def ensure_master_data_and_rbac(db: AsyncSession) -> None:
    """Seeds or updates grouped permissions, strict hospital roles, sample users, ICD-10, and Formulary."""
    # 1. Seed Grouped Permissions
    perm_map: Dict[str, Permission] = {}
    for perm_name, grp_name, perm_desc in DEFAULT_PERMISSIONS:
        result = await db.execute(select(Permission).where(Permission.name == perm_name))
        perm = result.scalar_one_or_none()
        if not perm:
            perm = Permission(name=perm_name, group_name=grp_name, description=perm_desc)
            db.add(perm)
            await db.flush()
        else:
            perm.group_name = grp_name
            perm.description = perm_desc
        perm_map[perm_name] = perm

    # 2. Seed Hospital Role Groups (Strict Segregation of Duties: Admin NEVER gets clinical sign/prescribe)
    role_definitions = {
        "Admin": (
            "ผู้ดูแลระบบและฐานข้อมูลหลัก (System & Master Data Admin - ห้ามบันทึกเวชระเบียนหรือสั่งยา)",
            [
                perm_map["patient:read"],
                perm_map["masterdata:icd10"],
                perm_map["masterdata:medications"],
                perm_map["masterdata:patients"],
                perm_map["admin:users"],
                perm_map["admin:roles"],
                perm_map["admin:modules"],
                perm_map["audit:read"],
            ],
        ),
        "Doctor": (
            "แพทย์ผู้ตรวจรักษา (Licensed Physician - บันทึก SOAP, วินิจฉัย ICD-10 และสั่งยา)",
            [
                perm_map["patient:read"],
                perm_map["patient:write"],
                perm_map["queue:manage"],
                perm_map["triage:read"],
                perm_map["triage:write"],
                perm_map["encounter:read"],
                perm_map["encounter:write"],
                perm_map["encounter:sign"],
                perm_map["condition:read"],
                perm_map["condition:write"],
                perm_map["medication:read"],
                perm_map["medication:prescribe"],
            ],
        ),
        "Nurse": (
            "พยาบาลวิชาชีพคัดกรอง (Triage Nurse - วัดสัญญาณชีพและคัดกรองผู้ป่วย ห้ามสั่งยา/วินิจฉัยโรค)",
            [
                perm_map["patient:read"],
                perm_map["patient:write"],
                perm_map["queue:manage"],
                perm_map["triage:read"],
                perm_map["triage:write"],
                perm_map["encounter:read"],
                perm_map["condition:read"],
                perm_map["medication:read"],
            ],
        ),
        "Pharmacist": (
            "เภสัชกร (Hospital Pharmacist - ตรวจสอบแพ้ยา จ่ายยา และดูแลบัญชียาโรงพยาบาล)",
            [
                perm_map["patient:read"],
                perm_map["encounter:read"],
                perm_map["condition:read"],
                perm_map["medication:read"],
                perm_map["medication:dispense"],
                perm_map["masterdata:medications"],
            ],
        ),
        "Receptionist": (
            "เจ้าหน้าที่เวชระเบียนและต้อนรับ (Registration & MPI Staff - ลงทะเบียนผู้ป่วยและออกคิว)",
            [
                perm_map["patient:read"],
                perm_map["patient:write"],
                perm_map["queue:manage"],
                perm_map["masterdata:patients"],
            ],
        ),
        "Auditor": (
            "เจ้าหน้าที่ตรวจสอบคุณภาพและ PDPA (Compliance Auditor - อ่าน Audit Log อย่างเดียว)",
            [
                perm_map["audit:read"],
            ],
        ),
    }

    role_map: Dict[str, Role] = {}
    for role_name, (role_desc, permissions) in role_definitions.items():
        result = await db.execute(
            select(Role).options(selectinload(Role.permissions)).where(Role.name == role_name)
        )
        role = result.scalar_one_or_none()
        if not role:
            role = Role(
                name=role_name,
                description=role_desc,
                permissions=permissions,
            )
            db.add(role)
            await db.flush()
        else:
            role.description = role_desc
            role.permissions = permissions
        role_map[role_name] = role

    # 3. Seed Users for all 6 Roles
    initial_users = [
        (
            "admin",
            "admin@organella.health",
            "admin12345",
            "ผู้ดูแลระบบกลาง (System Administrator)",
            None,
            "IT Health Informatics",
            True,
            ["Admin"],
        ),
        (
            "dr.thanakorn",
            "dr.thanakorn@organella.health",
            "doctor12345",
            "นพ. ธนากร วงศ์วิจิตร",
            "ว.45892",
            "OPD-MED (อายุรกรรม)",
            False,
            ["Doctor"],
        ),
        (
            "nurse.suda",
            "nurse.suda@organella.health",
            "nurse12345",
            "พว. สุดาพร รักษ์บริบาล",
            "พย.29104",
            "OPD-Triage (จุดคัดกรอง)",
            False,
            ["Nurse"],
        ),
        (
            "pharm.wichai",
            "pharm.wichai@organella.health",
            "pharm12345",
            "ภก. วิชัย เลิศเภสัช",
            "ภ.18392",
            "OPD-Pharmacy (ห้องจ่ายยา)",
            False,
            ["Pharmacist"],
        ),
        (
            "reg.somporn",
            "reg.somporn@organella.health",
            "reg12345",
            "คุณสมพร เวชระเบียน",
            None,
            "Registration & MPI",
            False,
            ["Receptionist"],
        ),
        (
            "auditor.kanya",
            "auditor.kanya@organella.health",
            "audit12345",
            "คุณกัญญา ธรรมาภิบาล (PDPA Auditor)",
            None,
            "Quality & PDPA Compliance",
            False,
            ["Auditor"],
        ),
    ]

    for uname, email, pwd, fname, lic, dept, is_super, rnames in initial_users:
        u_res = await db.execute(
            select(User).options(selectinload(User.roles)).where(User.username == uname)
        )
        u = u_res.scalar_one_or_none()
        assigned_roles = [role_map[r] for r in rnames if r in role_map]
        if not u:
            u = User(
                username=uname,
                email=email,
                hashed_password=get_password_hash(pwd),
                full_name=fname,
                license_number=lic,
                department=dept,
                is_superuser=is_super,
                roles=assigned_roles,
            )
            db.add(u)
        else:
            if not u.roles:
                u.roles = assigned_roles
            if lic and not u.license_number:
                u.license_number = lic

    # 4. Seed Master ICD-10 Table
    for code, en, th, cat in INITIAL_ICD10_MASTER:
        icd_res = await db.execute(select(MasterICD10).where(MasterICD10.code == code))
        if not icd_res.scalar_one_or_none():
            db.add(
                MasterICD10(
                    code=code,
                    display_en=en,
                    display_th=th,
                    category=cat,
                    is_active=True,
                )
            )

    # 5. Seed Master Medications Formulary Table
    for code, gen, trade, strength, form, dosage, unit, allergy_cls in INITIAL_MEDICATIONS_MASTER:
        med_res = await db.execute(select(MasterMedication).where(MasterMedication.code == code))
        if not med_res.scalar_one_or_none():
            db.add(
                MasterMedication(
                    code=code,
                    generic_name=gen,
                    trade_name=trade,
                    strength=strength,
                    dosage_form=form,
                    default_dosage=dosage,
                    unit=unit,
                    drug_allergy_class=allergy_cls,
                    is_active=True,
                )
            )

    await db.commit()


async def seed_database():
    async with AsyncSessionLocal() as db:
        print("[Organella Seed] Starting database seeding...")
        await ensure_master_data_and_rbac(db)
        from organella_core.api.v1.doctor_opd import ensure_sample_opd_queue

        await ensure_sample_opd_queue(db)
        print(
            "[Organella Seed] Seeded 6 Hospital Roles, 20 Grouped Permissions, Master ICD-10, Drug Formulary & OPD Queue!"
        )


if __name__ == "__main__":
    asyncio.run(seed_database())
