export type Gender = 'male' | 'female' | 'other' | 'unknown';

export interface PatientDemographics {
  id: string;
  hn: string;
  citizenId?: string;
  prefix?: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  birthDate: string; // YYYY-MM-DD
  allergies?: string[];
  bloodGroup?: string;
}

export interface EncounterSummary {
  id: string;
  patientId: string;
  encounterType: 'OPD' | 'IPD' | 'ER';
  status: 'planned' | 'in-progress' | 'finished' | 'cancelled';
  startTime: string;
  endTime?: string;
  departmentId?: string;
}
