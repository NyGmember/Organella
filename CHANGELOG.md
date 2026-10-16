# Changelog

All notable changes to the **Organella** Open-Source Modular Healthcare Platform are documented in this file.

## [0.1.0] - 2026-10-16

### Added
- **Phase 0 (`ORG-1`) — Architecture, Documentation & Monorepo Foundation**:
  - Diátaxis documentation structure (`docs/architecture`, `docs/modules`, `docs/standards`, `docs/operations`, `docs/rfcs`).
  - `pnpm` workspace monorepo (`@organella/sdk`, `@organella/fhir-helpers`, `@organella/host-shell`) + Python FastAPI (`organella-core`) + Docker Compose (`postgres:16-alpine`, `redis:7-alpine`).
- **Phase 1 (`ORG-2`) — Core Engine, MPI, Audit Trail & HL7 FHIR R4 Gateway**:
  - SQLAlchemy 2.0 Async Engine & Alembic Migrations.
  - Master Patient Index (`mpi_patients`) CRUD & search API with automatic HIPAA/PDPA `AuditLog` entries.
  - HL7 FHIR R4 Interoperability Gateway (`/fhir/r4/Patient`, `/fhir/r4/metadata`).
- **Phase 2 (`ORG-3`) — Dynamic Module Registry, Redis Event Bus & Micro-Frontend Slots**:
  - Backend Module Manager (`/api/v1/modules`, `/api/v1/modules/sync`, `/api/v1/modules/{id}/toggle`) and Redis Pub/Sub Event Bus.
  - Frontend `DynamicSlot`, `SlotErrorBoundary`, and resilient Module Federation loader with local workspace package fallback.
- **Phase 3 & 3.5 (`ORG-4`) — Clinical OPD Consultation, Master Data Management & Role-List RBAC**:
  - Clinical models (`opd_encounters`, `opd_conditions`, `opd_medications`) and Master Data models (`master_icd10_codes`, `master_medications`).
  - HL7 FHIR R4 `$everything` Clinical Bundle (`/fhir/r4/Encounter/{id}/$everything`), `/fhir/r4/Condition`, and `/fhir/r4/MedicationRequest`.
  - Granular **Role-List Access Control** (6 Permission Groups, 20 Granular Permissions, Multi-Group + Direct Individual Permission assignment per user) checking required role lists and reporting `missing_roles` on `403 Forbidden`.
  - Strict Clinical Accountability Guard preventing Host Shell / Admin / non-physician accounts from signing SOAP notes or prescribing medications on behalf of a doctor.
  - Master Data Management & CSV/JSON Bulk Import Console for ICD-10, Hospital Drug Formulary, and MPI Patients.
- **Phase 4 (`ORG-5`) — Module CLI Scaffolder, Pharmacy Dispense Module & Open-Source Release**:
  - `pnpm create:module` CLI Scaffolder (`scripts/create-organella-module.mjs`).
  - Second plug-and-play showcase module: `@organella-module/pharmacy-dispense` (Pharmacy Dispensing & Drug Allergy Verification) connected to `POST /api/v1/modules/doctor-opd/encounters/{encounter_number}/dispense`.
  - GitHub Issue & Pull Request templates for community contributions.
