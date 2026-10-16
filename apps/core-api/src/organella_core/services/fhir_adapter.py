from typing import Any, Dict, List, Optional

from fhir.resources.bundle import Bundle, BundleEntry
from fhir.resources.humanname import HumanName
from fhir.resources.identifier import Identifier
from fhir.resources.patient import Patient as FHIRPatient

from organella_core.models.clinical import Condition as DBCondition
from organella_core.models.clinical import Encounter as DBEncounter
from organella_core.models.clinical import MedicationOrder as DBMedicationOrder
from organella_core.models.patient import Patient as DBPatient


def patient_to_fhir(patient: DBPatient) -> FHIRPatient:
    """Converts an internal DB Patient model to an official HL7 FHIR R4 Patient Resource"""
    identifiers: List[Identifier] = [
        Identifier(
            system="https://organella.health/identifier/hn",
            value=patient.hn,
            use="official",
        )
    ]

    if patient.citizen_id:
        identifiers.append(
            Identifier(
                system="https://organella.health/identifier/citizen-id",
                value=patient.citizen_id,
                use="official",
            )
        )

    name = HumanName(
        use="official",
        family=patient.last_name,
        given=[patient.first_name],
        prefix=[patient.prefix] if patient.prefix else None,
    )

    # Validate FHIR gender
    gender_map = {
        "male": "male",
        "female": "female",
        "other": "other",
        "unknown": "unknown",
    }
    fhir_gender = gender_map.get(patient.gender.lower(), "unknown")

    return FHIRPatient(
        id=str(patient.id),
        identifier=identifiers,
        active=patient.is_active,
        name=[name],
        gender=fhir_gender,
        birthDate=patient.birth_date.isoformat(),
    )


def create_patient_bundle(
    patients: List[DBPatient],
    base_url: str = "http://localhost:8000/fhir/r4",
    total: Optional[int] = None,
) -> Bundle:
    """Wraps a list of patients into an HL7 FHIR R4 searchset Bundle"""
    entries = []
    for pat in patients:
        fhir_pat = patient_to_fhir(pat)
        entry = BundleEntry(
            fullUrl=f"{base_url}/Patient/{fhir_pat.id}",
            resource=fhir_pat,
        )
        entries.append(entry)

    return Bundle(
        type="searchset",
        total=total if total is not None else len(entries),
        entry=entries,
    )


def encounter_to_fhir_dict(
    encounter: DBEncounter, patient: Optional[DBPatient] = None
) -> Dict[str, Any]:
    """Converts an internal DB Encounter model into a strict HL7 FHIR R4 Encounter resource dict"""
    class_code = "AMB" if encounter.encounter_type == "OPD" else "IMP"
    class_display = "ambulatory" if encounter.encounter_type == "OPD" else "inpatient encounter"

    subject_ref: Dict[str, Any] = {"reference": f"Patient/{encounter.patient_id}"}
    if patient:
        prefix = f"{patient.prefix} " if patient.prefix else ""
        subject_ref["display"] = f"{prefix}{patient.first_name} {patient.last_name}".strip()

    period: Dict[str, Any] = {
        "start": encounter.started_at.isoformat() if encounter.started_at else None
    }
    if encounter.ended_at:
        period["end"] = encounter.ended_at.isoformat()

    resource: Dict[str, Any] = {
        "resourceType": "Encounter",
        "id": str(encounter.id),
        "identifier": [
            {
                "system": "https://organella.health/identifier/encounter-number",
                "value": encounter.encounter_number,
                "use": "official",
            }
        ],
        "status": encounter.status,
        "class": {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": class_code,
            "display": class_display,
        },
        "priority": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActPriority",
                    "code": encounter.priority,
                }
            ]
        },
        "subject": subject_ref,
        "period": period,
        "serviceType": {"text": encounter.department},
    }

    if encounter.chief_complaint:
        resource["reasonCode"] = [{"text": encounter.chief_complaint}]

    return resource


def condition_to_fhir_dict(condition: DBCondition) -> Dict[str, Any]:
    """Converts an internal DB Condition (ICD-10) into an HL7 FHIR R4 Condition resource dict"""
    return {
        "resourceType": "Condition",
        "id": str(condition.id),
        "clinicalStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                    "code": condition.clinical_status,
                }
            ]
        },
        "verificationStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                    "code": condition.verification_status,
                }
            ]
        },
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-category",
                        "code": "encounter-diagnosis",
                        "display": "Encounter Diagnosis",
                    }
                ],
                "text": condition.diagnosis_type,
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://hl7.org/fhir/sid/icd-10",
                    "code": condition.icd10_code,
                    "display": condition.icd10_display,
                }
            ],
            "text": f"{condition.icd10_code} - {condition.icd10_display}",
        },
        "subject": {"reference": f"Patient/{condition.patient_id}"},
        "encounter": {"reference": f"Encounter/{condition.encounter_id}"},
        "recordedDate": condition.created_at.isoformat() if condition.created_at else None,
    }


def medication_to_fhir_dict(med: DBMedicationOrder) -> Dict[str, Any]:
    """Converts an internal DB MedicationOrder into an HL7 FHIR R4 MedicationRequest resource dict"""
    coding = []
    if med.medication_code:
        coding.append(
            {
                "system": "https://organella.health/terminology/medication-code",
                "code": med.medication_code,
                "display": med.medication_name,
            }
        )

    return {
        "resourceType": "MedicationRequest",
        "id": str(med.id),
        "status": med.status,
        "intent": "order",
        "medicationCodeableConcept": {
            "coding": coding,
            "text": med.medication_name,
        },
        "subject": {"reference": f"Patient/{med.patient_id}"},
        "encounter": {"reference": f"Encounter/{med.encounter_id}"},
        "authoredOn": med.created_at.isoformat() if med.created_at else None,
        "dosageInstruction": [
            {
                "text": med.dosage_instruction,
            }
        ],
        "dispenseRequest": {
            "quantity": {
                "value": med.quantity,
                "unit": med.unit,
            }
        },
    }


def create_encounter_everything_bundle(
    encounter: DBEncounter,
    patient: DBPatient,
    base_url: str = "http://localhost:8000/fhir/r4",
) -> Dict[str, Any]:
    """
    Generates an HL7 FHIR R4 Collection Bundle ($everything) for a clinical encounter,
    packaging Patient, Encounter, Conditions (ICD-10), and MedicationRequests.
    """
    fhir_patient = patient_to_fhir(patient).model_dump(mode="json", exclude_none=True)
    fhir_encounter = encounter_to_fhir_dict(encounter, patient)

    entries: List[Dict[str, Any]] = [
        {
            "fullUrl": f"{base_url}/Patient/{patient.id}",
            "resource": fhir_patient,
        },
        {
            "fullUrl": f"{base_url}/Encounter/{encounter.id}",
            "resource": fhir_encounter,
        },
    ]

    for cond in encounter.conditions:
        entries.append(
            {
                "fullUrl": f"{base_url}/Condition/{cond.id}",
                "resource": condition_to_fhir_dict(cond),
            }
        )

    for med in encounter.medications:
        entries.append(
            {
                "fullUrl": f"{base_url}/MedicationRequest/{med.id}",
                "resource": medication_to_fhir_dict(med),
            }
        )

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "total": len(entries),
        "entry": entries,
    }
