import React, { Suspense } from 'react';

interface SlotHostProps {
  slotId: string;
  fallbackText?: string;
  children?: React.ReactNode;
}

export const SlotHost: React.FC<SlotHostProps> = ({
  slotId,
  fallbackText = 'กำลังโหลดโมดูลส่วนขยาย...',
  children,
}) => {
  return (
    <div data-slot-id={slotId} className="w-full">
      <Suspense
        fallback={
          <div className="p-4 border border-dashed rounded-md bg-slate-50 text-slate-400 text-sm animate-pulse">
            {fallbackText}
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
};
