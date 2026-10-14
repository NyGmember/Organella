import React from 'react';
import type { DashboardWidgetProps } from '@organella/sdk';

export const DoctorQueueWidget: React.FC<DashboardWidgetProps> = () => {
  const queueList = [
    { queueNo: 'A01', hn: '670001', name: 'นายสมศักดิ์ มั่นคง', status: 'กำลังตรวจ' },
    { queueNo: 'A02', hn: '670002', name: 'นางสาววิภาดา รักษ์สุข', status: 'รอเรียก' },
    { queueNo: 'A03', hn: '670003', name: 'ด.ช. อัครเดช มีชัย', status: 'รอผลแล็บ' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>คิวรอตรวจวันนี้ (3 เคส)</span>
        <span className="text-teal-600 font-medium">ห้องตรวจ 4</span>
      </div>

      <div className="space-y-2">
        {queueList.map((item) => (
          <div
            key={item.queueNo}
            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
          >
            <div className="flex items-center space-x-2">
              <span className="font-bold font-mono bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded">
                {item.queueNo}
              </span>
              <span className="text-slate-700 font-medium">{item.name}</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                item.status === 'กำลังตรวจ'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DoctorQueueWidget;
