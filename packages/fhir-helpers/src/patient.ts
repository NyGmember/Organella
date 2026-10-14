import { PatientDemographics } from '@organella/sdk';

export interface FHIRIdentifier {
  system: string;
  value: string;
  use?: 'official' | 'usual' | 'secondary';
}

export interface FHIRHumanName {
  use?: 'official' | 'usual' | 'nickname';
  family?: string;
  given?: string[];
  prefix?: string[];
}

export interface FHIRPatientResource {
  resourceType: 'Patient';
  id?: string;
  identifier: FHIRIdentifier[];
  active: boolean;
  name: FHIRHumanName[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
}

/**
 * Maps an Organella Internal Patient record to an HL7 FHIR R4 Patient Resource
 */
export function toFHIRPatient(patient: PatientDemographics): FHIRPatientResource {
  const identifiers: FHIRIdentifier[] = [
    {
      system: 'https://organella.health/identifier/hn',
      value: patient.hn,
      use: 'official',
    },
  ];

  if (patient.citizenId) {
    identifiers.push({
      system: 'https://organella.health/identifier/citizen-id',
      value: patient.citizenId,
      use: 'official',
    });
  }

  const name: FHIRHumanName = {
    use: 'official',
    family: patient.lastName,
    given: [patient.firstName],
    prefix: patient.prefix ? [patient.prefix] : undefined,
  };

  return {
    resourceType: 'Patient',
    id: patient.id,
    identifier: identifiers,
    active: true,
    name: [name],
    gender: patient.gender,
    birthDate: patient.birthDate,
  };
}
