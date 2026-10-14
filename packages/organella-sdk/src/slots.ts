import React from 'react';
import { PatientDemographics, EncounterSummary } from './patient';

export interface BaseSlotProps {
  moduleId: string;
}

export interface PatientTabProps extends BaseSlotProps {
  patient: PatientDemographics;
  activeEncounter?: EncounterSummary;
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
