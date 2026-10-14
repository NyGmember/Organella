import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConsultationTab } from './ConsultationTab';
import { DoctorQueueWidget } from './DoctorQueueWidget';

const testPatient = {
  id: 'pat-0001',
  hn: '670001',
  firstName: 'สมศักดิ์',
  lastName: 'มั่นคง',
  gender: 'male' as const,
  birthDate: '1985-05-12',
  prefix: 'นาย',
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Doctor OPD Module (Standalone Preview)</h2>
      <div style={{ marginBottom: 20 }}>
        <h3>Queue Widget</h3>
        <DoctorQueueWidget moduleId="doctor-opd" userId="usr-1" />
      </div>
      <div>
        <h3>Consultation Tab</h3>
        <ConsultationTab moduleId="doctor-opd" patient={testPatient} />
      </div>
    </div>
  </React.StrictMode>
);
