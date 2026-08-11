import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Alert, Card, EmptyState, PageLoader, StatCard, TableWrap } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, qs } from '../lib/api';
import { BUCKET_LABEL, formatDateTime, formatNumber, TX_TYPE_LABEL } from '../lib/format';
import type { TokenTransaction, WalletSummary } from '../types';

const PAGE_SIZE = 30;

export const WalletPage: React.FC = () => {
  const { setTokenBalance } = useAuth();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    void api.get<WalletSummary>('/wallet').then((data) => {
      setSummary(data);
      // Đẩy luôn sang huy hiệu trên thanh điều hướng, tránh cảnh ví báo còn điểm
      // mà huy hiệu vẫn hiện 0.
      setTokenBalance(data.tokenBalance);
    });
  }, [setTokenBalance]);

  useEffect(() => {
    void api
      .get<{ transactions: TokenTransaction[]; total: number }>(`/wallet/transactions${qs({ page, limit: PAGE_SIZE })}`)
      .then((data) => {
        setTransactions(data.transactions);
        setTotal(data.total);
      });
  }, [page]);

  if (!summary) return <PageLoader />;

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Ví điểm</h1>
          <p className="text-sm text-gray-500 mt-1">Toàn bộ biến động điểm của tài khoản.</p>
        </div>
        <Link to="/nap-tien">
          <Button className="!rounded-xl !py-2.5">Mua thêm điểm</Button>
        </Link>
      </div>

      {/*
        Thẻ gói tháng chỉ hiện với khách còn gói cũ chưa hết hạn. Gói tháng đã
        ngừng bán nên không còn nút "Gia hạn" — hết hạn thì khách chuyển hẳn sang
        mua điểm như mọi người.
      */}
      {summary.isSubscribed && (
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Gói tháng (đã ngừng bán)</p>
          <p className="text-gray-100 font-semibold mt-1">{summary.subscriptionName ?? 'Đang hoạt động'}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Còn hiệu lực tới {formatDateTime(summary.subscriptionExpiresAt)}. Sau mốc này, phần hạn mức tháng dừng lại;
            điểm bạn mua vẫn dùng bình thường.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Điểm khả dụng" value={formatNumber(summary.tokenBalance)} sub="dùng được ngay" />
        <StatCard
          label={summary.isSubscribed ? 'Trong đó: hạn mức tháng' : 'Điểm đã mua'}
          value={formatNumber(summary.isSubscribed ? summary.monthlyTokens : summary.purchasedTokens)}
          sub={
            summary.isSubscribed
              ? `trên ${formatNumber(summary.monthlyAllowance)} · cấp lại ${formatDateTime(summary.monthlyPeriodEnd)}`
              : 'không hết hạn'
          }
        />
        <StatCard label="Đã sử dụng" value={formatNumber(summary.totalTokensOut)} sub="điểm" />
        <StatCard
          label="Ảnh đã tạo"
          value={formatNumber(summary.successImages)}
          sub={`trên tổng ${formatNumber(summary.totalImages)} lượt`}
        />
      </div>

      <Alert tone="info">
        {summary.isSubscribed ? (
          <>
            Khi tạo ảnh, hệ thống <strong>trừ hạn mức tháng trước</strong>, hết mới dùng tới điểm đã mua. Hạn mức tháng
            không dùng hết sẽ <strong>không được cộng dồn</strong> sang chu kỳ sau; điểm đã mua thì không hết hạn.
          </>
        ) : (
          <>
            Điểm đã mua <strong>không hết hạn</strong> — dùng tới đâu trừ tới đó. Ảnh lỗi được hoàn điểm tự động và ghi
            rõ trong sao kê bên dưới.
          </>
        )}
      </Alert>

      <Card className="p-4">
        <h2 className="font-bold text-gray-100 mb-3">Sao kê</h2>
        {transactions.length === 0 ? (
          <EmptyState title="Chưa có biến động nào." />
        ) : (
          <TableWrap>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                <th className="text-left font-bold py-2">Thời gian</th>
                <th className="text-left font-bold py-2">Loại</th>
                <th className="text-left font-bold py-2">Nguồn</th>
                <th className="text-left font-bold py-2">Diễn giải</th>
                <th className="text-right font-bold py-2">Điểm</th>
                <th className="text-right font-bold py-2">Số dư sau</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-dark-850 last:border-0">
                  <td className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(tx.createdAt)}</td>
                  <td className="py-2.5 text-gray-300">{TX_TYPE_LABEL[tx.type]}</td>
                  <td className="py-2.5">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${
                        tx.bucket === 'monthly'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : 'bg-dark-800 text-gray-400 border-dark-700'
                      }`}
                    >
                      {BUCKET_LABEL[tx.bucket]}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-400 text-xs">{tx.description}</td>
                  <td className={`py-2.5 text-right font-semibold ${tx.amount > 0 ? 'text-green-400' : 'text-gray-300'}`}>
                    {tx.amount > 0 ? '+' : ''}
                    {formatNumber(tx.amount)}
                  </td>
                  <td className="py-2.5 text-right text-gray-500">{formatNumber(tx.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg bg-dark-850 text-gray-300 text-sm disabled:opacity-30"
            >
              ← Trước
            </button>
            <span className="text-sm text-gray-500">
              Trang {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg bg-dark-850 text-gray-300 text-sm disabled:opacity-30"
            >
              Sau →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};
