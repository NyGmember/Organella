import React, { Suspense } from 'react';
import { useOrganellaContext } from '@organella/sdk';
import { resolveSlotComponents } from '../services/slotRegistry';
import { SlotErrorBoundary } from './SlotErrorBoundary';

interface DynamicSlotProps {
  slotId: string;
  slotProps?: Record<string, any>;
  emptyFallback?: React.ReactNode;
}

export const DynamicSlot: React.FC<DynamicSlotProps> = ({
  slotId,
  slotProps = {},
  emptyFallback = null,
}) => {
  const { activeModules, patient, activeEncounter, user } = useOrganellaContext();
  const registeredComponents = resolveSlotComponents(slotId, activeModules);

  if (registeredComponents.length === 0) {
    return <>{emptyFallback}</>;
  }

  const combinedProps = {
    patient,
    activeEncounter,
    user,
    ...slotProps,
  };

  return (
    <div data-slot-id={slotId} className="space-y-4 w-full">
      {registeredComponents.map((item, idx) => {
        const RemoteComp = item.Component;
        return (
          <SlotErrorBoundary key={`${item.moduleId}-${idx}`} slotId={slotId} moduleId={item.moduleId}>
            <Suspense
              fallback={
                <div className="p-4 border border-dashed rounded-lg bg-slate-50 text-slate-400 text-xs animate-pulse flex items-center justify-between">
                  <span>กำลังโหลดคอมโพเนนต์โมดูล: {item.title}...</span>
                  <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded">
                    {item.moduleId}
                  </span>
                </div>
              }
            >
              <RemoteComp {...combinedProps} moduleId={item.moduleId} />
            </Suspense>
          </SlotErrorBoundary>
        );
      })}
    </div>
  );
};
