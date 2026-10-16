import React from 'react';
import ReactDOM from 'react-dom/client';
import { WorkspaceTab } from './WorkspaceTab';

const mockPatient = {
  id: 'pat-0001',
  hn: 'HN-2026-0001',
  prefix: 'นาย',
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  gender: 'male' as const,
  birthDate: '1978-05-14',
  allergies: ['Penicillin'],
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white p-6 rounded-xl shadow border border-slate-200">
        <WorkspaceTab
          moduleId="pharmacy-dispense"
          patient={mockPatient}
          readonly={true}
        />
      </div>
    </div>
  </React.StrictMode>
);
