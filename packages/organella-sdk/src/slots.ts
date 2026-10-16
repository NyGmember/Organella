import React from 'react';
import { OrganellaUser } from './context';
import { PatientDemographics, EncounterSummary } from './patient';

export interface BaseSlotProps {
  moduleId: string;
}

export interface PatientTabProps extends BaseSlotProps {
  patient: PatientDemographics;
  activeEncounter?: EncounterSummary;
  user?: OrganellaUser;
  readonly?: boolean;
}

export interface PatientBannerActionProps extends BaseSlotProps {
  patient: PatientDemographics;
  activeEncounter?: EncounterSummary;
}

export interface DashboardWidgetProps extends BaseSlotProps {
  userId: string;
  facilityId?: string;
}

export interface MainNavItemProps extends BaseSlotProps {
  isActive: boolean;
  routePath: string;
}

export type SlotComponent<P = any> = React.ComponentType<P>;
