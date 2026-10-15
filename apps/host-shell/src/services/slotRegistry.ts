import React, { lazy } from 'react';
import type { ModuleManifest } from '@organella/sdk';

export interface RegisteredSlotItem {
  moduleId: string;
  slotId: string;
  title: string;
  Component: React.ComponentType<any>;
}

// Static resolver for first-party/federated showcase modules
const federatedComponentMap: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
  'doctor-opd:./ConsultationTab': () => import('doctor_opd/ConsultationTab'),
  'doctor-opd:./DoctorQueueWidget': () => import('doctor_opd/DoctorQueueWidget'),
};

export function resolveSlotComponents(
  slotId: string,
  activeManifests: ModuleManifest[]
): RegisteredSlotItem[] {
  const matchedItems: RegisteredSlotItem[] = [];

  for (const manifest of activeManifests) {
    if (!manifest.frontend || !manifest.frontend.slots) {
      continue;
    }

    for (const slotDecl of manifest.frontend.slots) {
      if (slotDecl.slotId === slotId) {
        const lookupKey = `${manifest.id}:${slotDecl.component}`;
        const loader = federatedComponentMap[lookupKey];

        if (loader) {
          matchedItems.push({
            moduleId: manifest.id,
            slotId: slotDecl.slotId,
            title: slotDecl.title,
            Component: lazy(loader),
          });
        }
      }
    }
  }

  return matchedItems;
}
