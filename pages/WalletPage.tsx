import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card, EmptyState, PageLoader, StatCard, TableWrap } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, qs } from '../lib/api';
import { formatDateTime, formatNumber, formatVnd, TX_TYPE_LABEL } from '../lib/format';
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
      // Đẩy luôn sang huy hiệu trên thanh điều hướng, tránh cảnh ví báo còn token
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
          <h1 className="text-2xl font-bold text-white">Ví token</h1>
          <p className="text-sm text-gray-500 mt-1">Toàn bộ biến động token của tài khoản.</p>
        </div>
        <Link to="/nap-tien">
          <Button className="!rounded-xl !py-2.5">Nạp thêm token</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Số dư hiện tại" value={formatNumber(summary.tokenBalance)} sub="token" />
        <StatCard label="Tổng đã nạp" value={formatVnd(summary.totalTopupVnd)} sub={`${formatNumber(summary.totalTokensIn)} token`} />
        <StatCard label="Đã sử dụng" value={formatNumber(summary.totalTokensOut)} sub="token" />
        <StatCard
          label="Ảnh đã tạo"
          value={formatNumber(summary.successImages)}
          sub={`trên tổng ${formatNumber(summary.totalImages)} lượt`}
        />
      </div>

      <Card className="p-4">
        <h2 className="font-bold text-white mb-3">Sao kê</h2>
        {transactions.length === 0 ? (
          <EmptyState title="Chưa có biến động nào." />
        ) : (
          <TableWrap>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                <th className="text-left font-bold py-2">Thời gian</th>
                <th className="text-left font-bold py-2">Loại</th>
                <th className="text-left font-bold py-2">Diễn giải</th>
                <th className="text-right font-bold py-2">Token</th>
                <th className="text-right font-bold py-2">Số dư sau</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-dark-850 last:border-0">
                  <td className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(tx.createdAt)}</td>
                  <td className="py-2.5 text-gray-300">{TX_TYPE_LABEL[tx.type]}</td>
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
