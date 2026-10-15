import { createContext, useContext } from 'react';
import { ModuleManifest } from './manifest';
import { EncounterSummary, PatientDemographics } from './patient';

export interface OrganellaUser {
  id: string;
  username: string;
  fullName: string;
  licenseNumber?: string;
  department?: string;
  roles: string[];
  permissions: string[];
}

export interface OrganellaContextValue {
  patient: PatientDemographics;
  activeEncounter?: EncounterSummary;
  user?: OrganellaUser;
  activeModules: ModuleManifest[];
  activeWorkspaceTab: string;
  setActiveWorkspaceTab: (tabId: string) => void;
  emitEvent: (eventName: string, data: any) => void;
  onEvent: (eventName: string, handler: (data: any) => void) => () => void;
}

export const OrganellaContext = createContext<OrganellaContextValue | null>(null);

export function useOrganellaContext(): OrganellaContextValue {
  const context = useContext(OrganellaContext);
  if (!context) {
    throw new Error('useOrganellaContext must be used within an OrganellaProvider');
  }
  return context;
}

export function usePatient(): { patient: PatientDemographics; activeEncounter?: EncounterSummary } {
  const { patient, activeEncounter } = useOrganellaContext();
  return { patient, activeEncounter };
}
