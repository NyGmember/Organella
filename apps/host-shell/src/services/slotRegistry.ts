import React, { lazy } from 'react';
import type { ModuleManifest } from '@organella/sdk';

export interface RegisteredSlotItem {
  moduleId: string;
  slotId: string;
  title: string;
  Component: React.ComponentType<any>;
}

// Fallback loader that safely attempts remote federation first, and falls back to local workspace package
function createSafeFederatedComponent(
  remoteLoader: () => Promise<{ default: React.ComponentType<any> }>,
  localFallbackLoader: () => Promise<{ default: React.ComponentType<any> }>
) {
  return lazy(async () => {
    try {
      return await remoteLoader();
    } catch (err) {
      console.warn(
        '[SlotRegistry] Remote federation entry unavailable, falling back to local module package:',
        err
      );
      return await localFallbackLoader();
    }
  });
}

// Static resolver for first-party/federated showcase modules
const federatedComponentMap: Record<string, React.ComponentType<any>> = {
  'doctor-opd:./ConsultationTab': createSafeFederatedComponent(
    () => import('doctor_opd/ConsultationTab'),
    async () => {
      const mod = await import('@organella-module/doctor-opd');
      return { default: mod.ConsultationTab };
    }
  ),
  'doctor-opd:./DoctorQueueWidget': createSafeFederatedComponent(
    () => import('doctor_opd/DoctorQueueWidget'),
    async () => {
      const mod = await import('@organella-module/doctor-opd');
      return { default: mod.DoctorQueueWidget };
    }
  ),
  'pharmacy-dispense:./WorkspaceTab': createSafeFederatedComponent(
    async () => {
      const mod = await import('@organella-module/pharmacy-dispense');
      return { default: mod.WorkspaceTab };
    },
    async () => {
      const mod = await import('@organella-module/pharmacy-dispense');
      return { default: mod.WorkspaceTab };
    }
  ),
  'reception-triage:./WorkspaceTab': createSafeFederatedComponent(
    async () => {
      const mod = await import('@organella-module/reception-triage');
      return { default: mod.WorkspaceTab };
    },
    async () => {
      const mod = await import('@organella-module/reception-triage');
      return { default: mod.WorkspaceTab };
    }
  ),
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
        const Component = federatedComponentMap[lookupKey];

        if (Component) {
          matchedItems.push({
            moduleId: manifest.id,
            slotId: slotDecl.slotId,
            title: slotDecl.title,
            Component,
          });
        }
      }
    }
  }

  return matchedItems;
}
