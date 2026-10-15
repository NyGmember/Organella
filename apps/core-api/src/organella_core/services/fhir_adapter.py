from typing import List, Optional

from fhir.resources.bundle import Bundle, BundleEntry
from fhir.resources.humanname import HumanName
from fhir.resources.identifier import Identifier
from fhir.resources.patient import Patient as FHIRPatient

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
