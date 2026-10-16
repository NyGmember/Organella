import { PatientDemographics } from '@organella/sdk';
import { FHIRPatientResource, toFHIRPatient } from './patient';

export interface ClinicalConditionInput {
  id?: string;
  icd10Code: string;
  icd10Display: string;
  clinicalStatus?: 'active' | 'resolved' | 'remission';
  verificationStatus?: 'confirmed' | 'provisional' | 'differential';
  diagnosisType?: 'principal' | 'comorbidity' | 'complication';
}

export interface ClinicalMedicationInput {
  id?: string;
  medicationCode?: string;
  medicationName: string;
  dosageInstruction: string;
  quantity: number;
  unit: string;
  status?: 'active' | 'completed' | 'cancelled';
}

export interface ClinicalEncounterInput {
  id: string;
  encounterNumber: string;
  patientId: string;
  status: string;
  priority?: string;
  department: string;
  chiefComplaint?: string;
  startedAt?: string;
  endedAt?: string;
}

export function toFHIREncounter(encounter: ClinicalEncounterInput, patient?: PatientDemographics) {
  return {
    resourceType: 'Encounter' as const,
    id: encounter.id,
    identifier: [
      {
        system: 'https://organella.health/identifier/encounter-number',
        value: encounter.encounterNumber,
        use: 'official',
      },
    ],
    status: encounter.status,
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'AMB',
      display: 'ambulatory',
    },
    priority: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActPriority',
          code: encounter.priority || 'routine',
        },
      ],
    },
    subject: {
      reference: `Patient/${encounter.patientId}`,
      display: patient
        ? `${patient.prefix ? patient.prefix + ' ' : ''}${patient.firstName} ${patient.lastName}`
        : undefined,
    },
    period: {
      start: encounter.startedAt || new Date().toISOString(),
      ...(encounter.endedAt ? { end: encounter.endedAt } : {}),
    },
    serviceType: {
      text: encounter.department,
    },
    ...(encounter.chiefComplaint
      ? {
          reasonCode: [{ text: encounter.chiefComplaint }],
        }
      : {}),
  };
}

export function toFHIRCondition(
  condition: ClinicalConditionInput,
  patientId: string,
  encounterId: string
) {
  return {
    resourceType: 'Condition' as const,
    id: condition.id || `cond-${condition.icd10Code.toLowerCase()}`,
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: condition.clinicalStatus || 'active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          code: condition.verificationStatus || 'confirmed',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'encounter-diagnosis',
            display: 'Encounter Diagnosis',
          },
        ],
        text: condition.diagnosisType || 'principal',
      },
    ],
    code: {
      coding: [
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          code: condition.icd10Code,
          display: condition.icd10Display,
        },
      ],
      text: `${condition.icd10Code} - ${condition.icd10Display}`,
    },
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${encounterId}` },
  };
}

export function toFHIRMedicationRequest(
  med: ClinicalMedicationInput,
  patientId: string,
  encounterId: string
) {
  return {
    resourceType: 'MedicationRequest' as const,
    id: med.id || `rx-${med.medicationCode || 'order'}`,
    status: med.status || 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: med.medicationCode
        ? [
            {
              system: 'https://organella.health/terminology/medication-code',
              code: med.medicationCode,
              display: med.medicationName,
            },
          ]
        : [],
      text: med.medicationName,
    },
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${encounterId}` },
    dosageInstruction: [
      {
        text: med.dosageInstruction,
      },
    ],
    dispenseRequest: {
      quantity: {
        value: med.quantity,
        unit: med.unit,
      },
    },
  };
}

export function toFHIRClinicalBundle(params: {
  patient: PatientDemographics;
  encounter: ClinicalEncounterInput;
  conditions: ClinicalConditionInput[];
  medications: ClinicalMedicationInput[];
  baseUrl?: string;
}) {
  const baseUrl = params.baseUrl || 'http://localhost:8000/fhir/r4';
  const fhirPatient: FHIRPatientResource = toFHIRPatient(params.patient);
  const fhirEncounter = toFHIREncounter(params.encounter, params.patient);

  const entries: Array<{ fullUrl: string; resource: any }> = [
    {
      fullUrl: `${baseUrl}/Patient/${params.patient.id}`,
      resource: fhirPatient,
    },
    {
      fullUrl: `${baseUrl}/Encounter/${params.encounter.id}`,
      resource: fhirEncounter,
    },
  ];

  params.conditions.forEach((cond, idx) => {
    const res = toFHIRCondition(cond, params.patient.id, params.encounter.id);
    entries.push({
      fullUrl: `${baseUrl}/Condition/${res.id || idx + 1}`,
      resource: res,
    });
  });

  params.medications.forEach((med, idx) => {
    const res = toFHIRMedicationRequest(med, params.patient.id, params.encounter.id);
    entries.push({
      fullUrl: `${baseUrl}/MedicationRequest/${res.id || idx + 1}`,
      resource: res,
    });
  });

  return {
    resourceType: 'Bundle' as const,
    type: 'collection' as const,
    total: entries.length,
    entry: entries,
  };
}
