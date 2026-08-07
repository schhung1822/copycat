import React, { useEffect, useState } from 'react';
import { Badge, Card, EmptyState, PageLoader } from '../components/ui';
import { api, qs } from '../lib/api';
import { formatDateTime, STATUS_LABEL } from '../lib/format';
import type { Generation } from '../types';

const FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'success', label: 'Hoàn tất' },
  { value: 'processing', label: 'Đang vẽ' },
  { value: 'refunded', label: 'Lỗi' },
];

const PAGE_SIZE = 24;

export const HistoryPage: React.FC = () => {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void api
      .get<{ generations: Generation[]; total: number }>(`/generations${qs({ status, page, limit: PAGE_SIZE })}`)
      .then((data) => {
        if (cancelled) return;
        setGenerations(data.generations);
        setTotal(data.total);
      })
      .finally(() => !cancelled && setIsLoading(false));

    return () => {
      cancelled = true;
    };
  }, [status, page]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Lịch sử thiết kế</h1>
          <p className="text-sm text-gray-500 mt-1">{total} ảnh đã tạo</p>
        </div>

        <div className="flex gap-1.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                status === filter.value ? 'bg-brand-500 text-white' : 'bg-dark-850 text-gray-400 hover:bg-dark-800'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : generations.length === 0 ? (
        <Card className="p-6">
          <EmptyState title="Không có ảnh nào." hint="Hãy tạo thiết kế đầu tiên ở trang Tạo ảnh." />
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {generations.map((item) => (
            <Card key={item.id} className="overflow-hidden flex flex-col">
              <div className="aspect-[3/4] bg-dark-850 relative">
                {item.imageUrl && item.status === 'success' ? (
                  <img
                    src={item.imageUrl}
                    alt="Thiết kế"
                    className="w-full h-full object-cover cursor-zoom-in"
                    onClick={() => setPreviewUrl(item.imageUrl)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-3 text-center">
                    <span className="text-[11px] text-gray-600 line-clamp-4">
                      {item.errorMessage ?? STATUS_LABEL[item.status]}
                    </span>
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <Badge status={item.status}>{STATUS_LABEL[item.status]}</Badge>
                </div>
              </div>
              <div className="p-2.5 border-t border-dark-800">
                <p className="text-[11px] text-gray-400 truncate" title={item.modelLabel}>
                  {item.modelLabel}
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {formatDateTime(item.createdAt)} · {item.tokenCost} điểm
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg bg-dark-850 text-gray-300 text-sm disabled:opacity-30 hover:bg-dark-800 transition-colors"
          >
            ← Trước
          </button>
          <span className="text-sm text-gray-500">
            Trang {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg bg-dark-850 text-gray-300 text-sm disabled:opacity-30 hover:bg-dark-800 transition-colors"
          >
            Sau →
          </button>
        </div>
      )}

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img src={previewUrl} alt="Xem lớn" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
};
