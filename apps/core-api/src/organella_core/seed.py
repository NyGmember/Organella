import asyncio

from sqlalchemy import select

from organella_core.database import AsyncSessionLocal
from organella_core.models.auth import Permission, Role, User
from organella_core.security import get_password_hash

DEFAULT_PERMISSIONS = [
    ("patient:read", "View patient demographics and records"),
    ("patient:write", "Register and update patient records"),
    ("encounter:read", "View clinical encounters and visits"),
    ("encounter:write", "Create and document encounters and SOAP notes"),
    ("condition:read", "View medical diagnoses and ICD codes"),
    ("condition:write", "Record medical diagnoses"),
    ("medication:read", "View medication prescriptions and orders"),
    ("medication:write", "Prescribe and dispense medications"),
    ("audit:read", "Inspect system audit logs and compliance trails"),
    ("admin:modules", "Install, configure, and manage extension modules"),
    ("admin:users", "Manage system users and access roles"),
]


async def seed_database():
    async with AsyncSessionLocal() as db:
        print("[Organella Seed] Starting database seeding...")

        # 1. Seed Permissions
        perm_map = {}
        for perm_name, perm_desc in DEFAULT_PERMISSIONS:
            result = await db.execute(select(Permission).where(Permission.name == perm_name))
            perm = result.scalar_one_or_none()
            if not perm:
                perm = Permission(name=perm_name, description=perm_desc)
                db.add(perm)
                await db.flush()
                print(f"  + Added Permission: {perm_name}")
            perm_map[perm_name] = perm

        # 2. Seed Roles
        role_definitions = {
            "Admin": list(perm_map.values()),
            "Doctor": [
                perm_map["patient:read"],
                perm_map["patient:write"],
                perm_map["encounter:read"],
                perm_map["encounter:write"],
                perm_map["condition:read"],
                perm_map["condition:write"],
                perm_map["medication:read"],
                perm_map["medication:write"],
            ],
            "Nurse": [
                perm_map["patient:read"],
                perm_map["patient:write"],
                perm_map["encounter:read"],
                perm_map["encounter:write"],
                perm_map["medication:read"],
            ],
            "Pharmacist": [
                perm_map["patient:read"],
                perm_map["medication:read"],
                perm_map["medication:write"],
            ],
        }

        role_map = {}
        for role_name, permissions in role_definitions.items():
            result = await db.execute(select(Role).where(Role.name == role_name))
            role = result.scalar_one_or_none()
            if not role:
                role = Role(
                    name=role_name,
                    description=f"Standard hospital role: {role_name}",
                    permissions=permissions,
                )
                db.add(role)
                await db.flush()
                print(f"  + Added Role: {role_name} ({len(permissions)} permissions)")
            role_map[role_name] = role

        # 3. Seed Initial Users
        # Admin User
        admin_result = await db.execute(select(User).where(User.username == "admin"))
        if not admin_result.scalar_one_or_none():
            admin_user = User(
                username="admin",
                email="admin@organella.health",
                hashed_password=get_password_hash("admin12345"),
                full_name="ผู้ดูแลระบบกลาง (System Administrator)",
                department="IT Health Informatics",
                is_superuser=True,
                roles=[role_map["Admin"]],
            )
            db.add(admin_user)
            print("  + Added User: admin (password: admin12345)")

        # Doctor User
        doctor_result = await db.execute(select(User).where(User.username == "dr.thanakorn"))
        if not doctor_result.scalar_one_or_none():
            doctor_user = User(
                username="dr.thanakorn",
                email="dr.thanakorn@organella.health",
                hashed_password=get_password_hash("doctor12345"),
                full_name="นพ. ธนากร วงศ์วิจิตร",
                license_number="ว.45892",
                department="OPD-MED",
                is_superuser=False,
                roles=[role_map["Doctor"]],
            )
            db.add(doctor_user)
            print("  + Added User: dr.thanakorn (password: doctor12345)")

        await db.commit()
        print("[Organella Seed] Database seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(seed_database())
