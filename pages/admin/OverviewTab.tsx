import React, { useEffect, useState } from 'react';
import { BarChart, CHART_COLORS } from '../../components/BarChart';
import { Alert, Card, PageLoader, StatCard, TableWrap } from '../../components/ui';
import { api } from '../../lib/api';
import { formatNumber, formatVnd } from '../../lib/format';
import type { AdminOverview, DailyPoint, ModelReport } from '../../types';

/** Rút gọn số tiền lớn cho trục dọc: 1.200.000đ -> 1,2tr */
const compactVnd = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}tr`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
};

export const OverviewTab: React.FC = () => {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [models, setModels] = useState<ModelReport[]>([]);
  const [topUsers, setTopUsers] = useState<any[]>([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    void Promise.all([
      api.get<AdminOverview>('/admin/overview'),
      api.get<{ models: ModelReport[] }>('/admin/reports/models'),
      api.get<{ users: any[] }>('/admin/reports/top-users'),
    ]).then(([overviewData, modelData, userData]) => {
      setOverview(overviewData);
      setModels(modelData.models);
      setTopUsers(userData.users);
    });
  }, []);

  useEffect(() => {
    void api.get<{ series: DailyPoint[] }>(`/admin/reports/daily?days=${days}`).then((data) => setDaily(data.series));
  }, [days]);

  if (!overview) return <PageLoader />;

  const labels = daily.map((point) => point.day.slice(5).replace('-', '/'));
  const unconfiguredProviders = overview.system.providers.filter((provider) => !provider.configured);

  return (
    <div className="space-y-6">
      {unconfiguredProviders.length > 0 && (
        <Alert tone="warning">
          Nhà cung cấp chưa cấu hình API key: <strong>{unconfiguredProviders.map((p) => p.name).join(', ')}</strong>.
          Khách sẽ không tạo được ảnh cho tới khi điền key vào file <code>.env</code>.
        </Alert>
      )}

      {/* ---- Chỉ số chính ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Doanh thu hôm nay"
          value={formatVnd(overview.revenue.today)}
          sub={`7 ngày: ${formatVnd(overview.revenue.last7Days)}`}
        />
        <StatCard
          label="Doanh thu 30 ngày"
          value={formatVnd(overview.revenue.last30Days)}
          sub={`Tổng: ${formatVnd(overview.revenue.total)}`}
        />
        <StatCard
          label="Lợi nhuận gộp"
          value={formatVnd(overview.cost.grossProfitVnd)}
          sub={`Biên ${overview.cost.grossMarginPercent}% · vốn ${formatVnd(overview.cost.apiCostVnd)}`}
          tone={overview.cost.grossProfitVnd >= 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Đơn chờ thanh toán"
          value={formatNumber(overview.revenue.pendingOrders)}
          sub={`${formatNumber(overview.revenue.paidOrders)} đơn đã thanh toán`}
          tone={overview.revenue.pendingOrders > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* ---- Thuê bao ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Thuê bao đang chạy"
          value={formatNumber(overview.subscribers.active)}
          sub={`${overview.subscribers.expiringIn7Days} gói hết hạn trong 7 ngày`}
          tone={overview.subscribers.expiringIn7Days > 0 ? 'warning' : 'positive'}
        />
        <StatCard
          label="Doanh thu gói tháng"
          value={formatVnd(overview.revenue.subscriptionRevenue)}
          sub={`${Math.round(
            (overview.revenue.subscriptionRevenue / Math.max(overview.revenue.total, 1)) * 100,
          )}% tổng doanh thu`}
        />
        <StatCard
          label="Doanh thu điểm lẻ"
          value={formatVnd(overview.revenue.extraTokenRevenue)}
          sub="khách mua thêm ngoài hạn mức"
        />
        <StatCard
          label="Hạn mức chưa dùng"
          value={formatNumber(overview.subscribers.monthlyTokensRemaining)}
          sub="điểm, sẽ mất khi sang chu kỳ mới"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Khách hàng"
          value={formatNumber(overview.users.total)}
          sub={`+${overview.users.newToday} hôm nay · +${overview.users.new30Days} trong 30 ngày`}
        />
        <StatCard
          label="Ảnh đã tạo"
          value={formatNumber(overview.generations.total)}
          sub={`${overview.generations.today} hôm nay · tỉ lệ thành công ${overview.generations.successRate}%`}
        />
        <StatCard
          label="Điểm lẻ chưa dùng"
          value={formatNumber(overview.users.outstandingTokens)}
          sub={`Khách đã trả ~${formatVnd(overview.users.outstandingLiabilityVnd)} cho số này`}
          tone="warning"
        />
        <StatCard
          label="Hàng đợi"
          value={`${overview.system.queue.running} / ${overview.system.queue.running + overview.system.queue.pending}`}
          sub={`Thời gian vẽ trung bình ${overview.generations.avgDurationSec}s`}
        />
      </div>

      {/* ---- Biểu đồ ---- */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 gap-4">
          <h2 className="font-bold text-gray-100">Doanh thu và chi phí vốn theo ngày</h2>
          <div className="flex gap-1">
            {[7, 30, 90].map((option) => (
              <button
                key={option}
                onClick={() => setDays(option)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  days === option ? 'bg-dark-700 text-gray-100' : 'bg-dark-850 text-gray-500 hover:text-gray-300'
                }`}
              >
                {option} ngày
              </button>
            ))}
          </div>
        </div>

        <BarChart
          labels={labels}
          format={compactVnd}
          series={[
            {
              key: 'revenue',
              label: 'Doanh thu',
              color: CHART_COLORS.primary,
              values: daily.map((point) => point.revenueVnd),
            },
            {
              key: 'cost',
              label: 'Chi phí API',
              color: CHART_COLORS.secondary,
              values: daily.map((point) => point.apiCostVnd),
            },
          ]}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="font-bold text-gray-100 mb-4">Số ảnh tạo mỗi ngày</h2>
          <BarChart
            labels={labels}
            format={(value) => formatNumber(Math.round(value))}
            height={160}
            series={[
              {
                key: 'images',
                label: 'Ảnh',
                color: CHART_COLORS.primary,
                values: daily.map((point) => point.images),
              },
            ]}
          />
        </Card>

        <Card className="p-5">
          <h2 className="font-bold text-gray-100 mb-4">Khách đăng ký mới mỗi ngày</h2>
          <BarChart
            labels={labels}
            format={(value) => formatNumber(Math.round(value))}
            height={160}
            series={[
              {
                key: 'users',
                label: 'Khách mới',
                color: CHART_COLORS.secondary,
                values: daily.map((point) => point.newUsers),
              },
            ]}
          />
        </Card>
      </div>

      {/* ---- Bảng phụ ---- */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="font-bold text-gray-100 mb-3">Hiệu quả theo model</h2>
          <TableWrap>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                <th className="text-left font-bold py-2">Model</th>
                <th className="text-right font-bold py-2">Lượt</th>
                <th className="text-right font-bold py-2">Doanh thu quy đổi</th>
                <th className="text-right font-bold py-2">Chi phí</th>
                <th className="text-right font-bold py-2">Biên</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-600 text-xs">
                    Chưa có dữ liệu.
                  </td>
                </tr>
              ) : (
                models.map((model) => (
                  <tr key={model.modelCode} className="border-b border-dark-850 last:border-0">
                    <td className="py-2.5 text-gray-300">{model.modelLabel}</td>
                    <td className="py-2.5 text-right text-gray-400">
                      {formatNumber(model.success)}/{formatNumber(model.total)}
                    </td>
                    <td className="py-2.5 text-right text-gray-300">{formatVnd(model.tokenValueVnd)}</td>
                    <td className="py-2.5 text-right text-gray-500">{formatVnd(model.apiCostVnd)}</td>
                    <td
                      className={`py-2.5 text-right font-semibold ${
                        model.marginPercent >= 50 ? 'text-green-400' : 'text-amber-400'
                      }`}
                    >
                      {model.marginPercent}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableWrap>
        </Card>

        <Card className="p-5">
          <h2 className="font-bold text-gray-100 mb-3">Khách hàng chi nhiều nhất</h2>
          <TableWrap>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                <th className="text-left font-bold py-2">Khách hàng</th>
                <th className="text-right font-bold py-2">Đã nạp</th>
                <th className="text-right font-bold py-2">Còn lại</th>
                <th className="text-right font-bold py-2">Ảnh</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-gray-600 text-xs">
                    Chưa có dữ liệu.
                  </td>
                </tr>
              ) : (
                topUsers.map((user) => (
                  <tr key={user.id} className="border-b border-dark-850 last:border-0">
                    <td className="py-2.5 text-gray-300 truncate max-w-[200px]">{user.fullName || user.email}</td>
                    <td className="py-2.5 text-right text-gray-300">{formatVnd(user.totalTopupVnd)}</td>
                    <td className="py-2.5 text-right text-brand-500">{formatNumber(user.tokenBalance)}</td>
                    <td className="py-2.5 text-right text-gray-500">{formatNumber(user.images)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </TableWrap>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-bold text-gray-100 mb-3">Cấu hình hệ thống</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Email quản trị (.env)</p>
            <p className="text-gray-300 mt-1 break-all">{overview.system.adminEmails.join(', ') || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Tỉ giá quy đổi</p>
            <p className="text-gray-300 mt-1">1 USD = {formatVnd(overview.cost.usdToVnd)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Lưu ảnh về server</p>
            <p className="text-gray-300 mt-1">{overview.system.downloadResults ? 'Bật' : 'Tắt'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
