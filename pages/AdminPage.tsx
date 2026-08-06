import React, { useState } from 'react';
import { OrdersTab } from './admin/OrdersTab';
import { OverviewTab } from './admin/OverviewTab';
import { PricingTab } from './admin/PricingTab';
import { UsersTab } from './admin/UsersTab';

const TABS = [
  { key: 'overview', label: 'Tổng quan', render: () => <OverviewTab /> },
  { key: 'orders', label: 'Đơn nạp', render: () => <OrdersTab /> },
  { key: 'users', label: 'Khách hàng', render: () => <UsersTab /> },
  { key: 'pricing', label: 'Bảng giá & gói nạp', render: () => <PricingTab /> },
] as const;

export const AdminPage: React.FC = () => {
  const [active, setActive] = useState<(typeof TABS)[number]['key']>('overview');
  const current = TABS.find((tab) => tab.key === active) ?? TABS[0];

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Bảng điều khiển</h1>
        <p className="text-sm text-gray-500 mt-1">Theo dõi doanh thu, chi phí và vận hành hệ thống.</p>
      </div>

      <div className="flex gap-1 border-b border-dark-800 overflow-x-auto custom-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active === tab.key
                ? 'border-brand-500 text-gray-100'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* key ép React dựng lại tab khi chuyển, để mỗi tab tự tải dữ liệu mới */}
      <div key={current.key}>{current.render()}</div>
    </div>
  );
};
