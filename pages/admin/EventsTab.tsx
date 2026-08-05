import React, { useEffect, useState } from 'react';
import { Badge, Card, EmptyState, TableWrap } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime, formatVnd } from '../../lib/format';
import type { PaymentEvent } from '../../types';

const STATUS_TEXT: Record<PaymentEvent['status'], string> = {
  matched: 'Đã khớp đơn',
  unmatched: 'Chưa khớp đơn',
  duplicate: 'Trùng / đã xử lý',
  error: 'Lỗi',
};

export const EventsTab: React.FC = () => {
  const [events, setEvents] = useState<PaymentEvent[]>([]);

  useEffect(() => {
    void api.get<{ events: PaymentEvent[] }>('/admin/payment-events?limit=50').then((data) => setEvents(data.events));
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Mọi giao dịch ngân hàng do webhook gửi về đều được ghi lại ở đây. Nếu khách báo đã chuyển tiền mà chưa nhận
        token, tra ở bảng này trước — thường là do nội dung chuyển khoản không chứa mã đơn.
      </p>

      <Card className="p-4">
        {events.length === 0 ? (
          <EmptyState
            title="Chưa nhận được giao dịch nào."
            hint="Kiểm tra webhook đã trỏ đúng về /api/webhooks/sepay hoặc /api/webhooks/casso chưa."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                <th className="text-left font-bold py-2">Thời gian</th>
                <th className="text-left font-bold py-2">Cổng</th>
                <th className="text-right font-bold py-2">Số tiền</th>
                <th className="text-left font-bold py-2 pl-4">Nội dung CK</th>
                <th className="text-left font-bold py-2">Mã đơn</th>
                <th className="text-left font-bold py-2">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-dark-850 last:border-0">
                  <td className="py-2.5 text-[11px] text-gray-500 whitespace-nowrap">
                    {formatDateTime(event.createdAt)}
                  </td>
                  <td className="py-2.5 text-xs text-gray-400 uppercase">{event.provider}</td>
                  <td className="py-2.5 text-right text-gray-300">{formatVnd(event.amountVnd)}</td>
                  <td className="py-2.5 pl-4 text-[11px] text-gray-500 max-w-[280px] truncate" title={event.content ?? ''}>
                    {event.content}
                  </td>
                  <td className="py-2.5 font-mono text-xs text-gray-300">{event.orderCode ?? '—'}</td>
                  <td className="py-2.5">
                    <Badge status={event.status}>{STATUS_TEXT[event.status]}</Badge>
                    {event.message && <p className="text-[10px] text-gray-600 mt-1 max-w-[240px]">{event.message}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
};
