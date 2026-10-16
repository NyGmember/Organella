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

export interface PermissionCheckResult {
  allowed: boolean;
  requiredRoles: string[];
  missingRoles: string[];
  errorMessage: string | null;
}

/**
 * Checks access exclusively against a required list of granular permissions/roles.
 * NEVER checks by Group name. Returns the exact list of missing permissions if any are absent.
 */
export function checkRequiredPermissions(
  userPermissions: string[] | undefined,
  requiredRoles: string[]
): PermissionCheckResult {
  const effectiveSet = new Set(userPermissions || []);
  const missingRoles = requiredRoles.filter((req) => !effectiveSet.has(req));
  const allowed = missingRoles.length === 0;
  return {
    allowed,
    requiredRoles,
    missingRoles,
    errorMessage: allowed
      ? null
      : `ปฏิเสธการเข้าถึง (Access Denied): ขาดสิทธิ์ที่จำเป็น [${missingRoles.join(', ')}]`,
  };
}

export interface OrganellaContextValue {
  patient: PatientDemographics;
  activeEncounter?: EncounterSummary;
  user?: OrganellaUser;
  authToken?: string;
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

export function usePatient(): {
  patient: PatientDemographics;
  activeEncounter?: EncounterSummary;
} {
  const { patient, activeEncounter } = useOrganellaContext();
  return { patient, activeEncounter };
}
