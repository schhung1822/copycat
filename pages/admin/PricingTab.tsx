import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Card, TableWrap } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { formatNumber, formatVnd } from '../../lib/format';
import type { AdminModelPricing, AdminPackage } from '../../types';

/** Ô nhập chỉnh sửa tại chỗ: chỉ gọi API khi giá trị thực sự đổi và rời khỏi ô. */
const EditableCell: React.FC<{
  value: string | number;
  onSave: (value: string) => Promise<void>;
  align?: 'left' | 'right';
  width?: string;
}> = ({ value, onSave, align = 'right', width = 'w-20' }) => {
  const [draft, setDraft] = useState(String(value));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setDraft(String(value)), [value]);

  const commit = async () => {
    if (draft === String(value)) return;
    setIsSaving(true);
    try {
      await onSave(draft);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <input
      className={`${width} bg-dark-850 border border-dark-700 rounded-md px-2 py-1 text-xs text-gray-200 focus:border-brand-500 outline-none transition-colors ${
        align === 'right' ? 'text-right' : ''
      } ${isSaving ? 'opacity-50' : ''}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      disabled={isSaving}
    />
  );
};

interface AdminPlan {
  id: number;
  code: string;
  name: string;
  months: number;
  priceVnd: number;
  pricePerMonthVnd: number;
  monthlyTokenAllowance: number;
  description: string | null;
  isPopular: boolean;
  isActive: boolean;
}

export const PricingTab: React.FC = () => {
  const [models, setModels] = useState<AdminModelPricing[]>([]);
  const [packages, setPackages] = useState<AdminPackage[]>([]);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [usdToVnd, setUsdToVnd] = useState(28000);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [modelData, packageData, planData] = await Promise.all([
      api.get<{ models: AdminModelPricing[]; usdToVnd: number }>('/admin/pricing'),
      api.get<{ packages: AdminPackage[] }>('/admin/packages'),
      api.get<{ plans: AdminPlan[] }>('/admin/plans'),
    ]);
    setModels(modelData.models);
    setUsdToVnd(modelData.usdToVnd);
    setPackages(packageData.packages);
    setPlans(planData.plans);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateModel = async (id: number, patch: Record<string, unknown>) => {
    setMessage(null);
    try {
      await api.patch(`/admin/pricing/${id}`, patch);
      await load();
      setMessage({ tone: 'success', text: 'Đã lưu bảng giá.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof ApiError ? err.message : 'Lưu thất bại.' });
      await load();
    }
  };

  const updatePackage = async (id: number, patch: Record<string, unknown>) => {
    setMessage(null);
    try {
      await api.patch(`/admin/packages/${id}`, patch);
      await load();
      setMessage({ tone: 'success', text: 'Đã lưu gói nạp.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof ApiError ? err.message : 'Lưu thất bại.' });
      await load();
    }
  };

  const updatePlan = async (id: number, patch: Record<string, unknown>) => {
    setMessage(null);
    try {
      await api.patch(`/admin/plans/${id}`, patch);
      await load();
      setMessage({ tone: 'success', text: 'Đã lưu gói dịch vụ.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof ApiError ? err.message : 'Lưu thất bại.' });
      await load();
    }
  };

  return (
    <div className="space-y-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="p-5">
        <div className="mb-4">
          <h2 className="font-bold text-gray-100">Gói dịch vụ theo tháng</h2>
          <p className="text-xs text-gray-500 mt-1">
            Khách bắt buộc mua gói này trước khi tạo ảnh. <strong>Hạn mức</strong> được cấp lại mỗi tháng và không cộng
            dồn, kể cả khi mua chu kỳ dài. 1 điểm = 1đ giá vốn, nên hạn mức 500.000 điểm đúng bằng 500.000đ tiền
            điểm theo giá gốc.
          </p>
        </div>

        <TableWrap>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
              <th className="text-left font-bold py-2">Mã</th>
              <th className="text-left font-bold py-2">Tên gói</th>
              <th className="text-right font-bold py-2">Chu kỳ</th>
              <th className="text-right font-bold py-2">Giá cả kỳ</th>
              <th className="text-right font-bold py-2">Quy ra/tháng</th>
              <th className="text-right font-bold py-2">Hạn mức/tháng</th>
              <th className="text-center font-bold py-2">Nổi bật</th>
              <th className="text-center font-bold py-2">Bán</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} className="border-b border-dark-850 last:border-0">
                <td className="py-2 text-gray-500 text-xs font-mono">{plan.code}</td>
                <td className="py-2">
                  <EditableCell
                    value={plan.name}
                    align="left"
                    width="w-32"
                    onSave={(value) => updatePlan(plan.id, { name: value })}
                  />
                </td>
                <td className="py-2 text-right">
                  <EditableCell
                    value={plan.months}
                    width="w-14"
                    onSave={(value) => updatePlan(plan.id, { months: Number(value) })}
                  />
                </td>
                <td className="py-2 text-right">
                  <EditableCell
                    value={plan.priceVnd}
                    width="w-28"
                    onSave={(value) => updatePlan(plan.id, { priceVnd: Number(value) })}
                  />
                </td>
                <td className="py-2 text-right text-gray-400 text-xs">{formatVnd(plan.pricePerMonthVnd)}</td>
                <td className="py-2 text-right">
                  <EditableCell
                    value={plan.monthlyTokenAllowance}
                    width="w-24"
                    onSave={(value) => updatePlan(plan.id, { monthlyTokenAllowance: Number(value) })}
                  />
                </td>
                <td className="py-2 text-center">
                  <input
                    type="checkbox"
                    checked={plan.isPopular}
                    onChange={(e) => updatePlan(plan.id, { isPopular: e.target.checked })}
                    className="accent-brand-500 cursor-pointer"
                  />
                </td>
                <td className="py-2 text-center">
                  <input
                    type="checkbox"
                    checked={plan.isActive}
                    onChange={(e) => updatePlan(plan.id, { isActive: e.target.checked })}
                    className="accent-brand-500 cursor-pointer"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card className="p-5">
        <div className="mb-4">
          <h2 className="font-bold text-gray-100">Bảng giá model</h2>
          <p className="text-xs text-gray-500 mt-1">
            <strong>Giá vốn</strong> là giá nhà cung cấp thu mỗi ảnh (theo bảng giá Kie.ai).{' '}
            <strong>Điểm thu</strong> là số điểm trừ của khách. Sửa trực tiếp trong ô rồi bấm ra ngoài để lưu.
          </p>
        </div>

        <TableWrap>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
              <th className="text-left font-bold py-2">Model</th>
              <th className="text-left font-bold py-2">Slug gửi API</th>
              <th className="text-left font-bold py-2">Độ phân giải</th>
              <th className="text-right font-bold py-2">Giá vốn (USD)</th>
              <th className="text-right font-bold py-2">≈ VNĐ</th>
              <th className="text-right font-bold py-2">Điểm thu</th>
              <th className="text-right font-bold py-2">Giá bán</th>
              <th className="text-right font-bold py-2">Biên</th>
              <th className="text-center font-bold py-2">Bán</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.id} className="border-b border-dark-850 last:border-0">
                <td className="py-2 text-gray-300 text-xs">{model.label}</td>
                <td className="py-2">
                  <EditableCell
                    value={model.providerModel}
                    align="left"
                    width="w-36"
                    onSave={(value) => updateModel(model.id, { providerModel: value })}
                  />
                </td>
                <td className="py-2 text-gray-400 text-xs">{model.resolution}</td>
                <td className="py-2 text-right">
                  <EditableCell
                    value={model.apiCostUsd}
                    width="w-20"
                    onSave={(value) => updateModel(model.id, { apiCostUsd: Number(value) })}
                  />
                </td>
                <td className="py-2 text-right text-gray-500 text-xs">{formatVnd(model.apiCostVnd)}</td>
                <td className="py-2 text-right">
                  <EditableCell
                    value={model.tokenCost}
                    width="w-16"
                    onSave={(value) => updateModel(model.id, { tokenCost: Number(value) })}
                  />
                </td>
                <td className="py-2 text-right text-gray-300 text-xs">{formatVnd(model.sellPriceVnd)}</td>
                <td
                  className={`py-2 text-right text-xs font-semibold ${
                    model.marginPercent >= 50 ? 'text-green-400' : model.marginPercent >= 30 ? 'text-amber-400' : 'text-red-400'
                  }`}
                >
                  {model.marginPercent}%
                </td>
                <td className="py-2 text-center">
                  <input
                    type="checkbox"
                    checked={model.isActive}
                    onChange={(e) => updateModel(model.id, { isActive: e.target.checked })}
                    className="accent-brand-500 cursor-pointer"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>

        <p className="text-[11px] text-gray-600 mt-3">
          Tỉ giá quy đổi hiện tại: 1 USD = {formatVnd(usdToVnd)} (sửa bằng <code>USD_TO_VND</code> trong <code>.env</code>).
          Giá bán = số điểm × 100đ.
        </p>
      </Card>

      <Card className="p-5">
        <div className="mb-4">
          <h2 className="font-bold text-gray-100">Gói điểm lẻ</h2>
          <p className="text-xs text-gray-500 mt-1">
            Dành cho khách đã dùng hết hạn mức tháng. Quy tắc định giá: bán <strong>gấp đôi giá vốn</strong>, tức số
            điểm nhận được bằng nửa số tiền nạp. Điểm mua thêm không hết hạn theo chu kỳ tháng.
          </p>
        </div>

        <TableWrap>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
              <th className="text-left font-bold py-2">Mã</th>
              <th className="text-left font-bold py-2">Tên gói</th>
              <th className="text-right font-bold py-2">Giá nạp</th>
              <th className="text-right font-bold py-2">Điểm cơ bản</th>
              <th className="text-right font-bold py-2">Điểm thưởng</th>
              <th className="text-right font-bold py-2">Tổng nhận</th>
              <th className="text-right font-bold py-2">Giá/điểm</th>
              <th className="text-center font-bold py-2">Nổi bật</th>
              <th className="text-center font-bold py-2">Bán</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg) => (
              <tr key={pkg.id} className="border-b border-dark-850 last:border-0">
                <td className="py-2 text-gray-500 text-xs font-mono">{pkg.code}</td>
                <td className="py-2">
                  <EditableCell
                    value={pkg.name}
                    align="left"
                    width="w-32"
                    onSave={(value) => updatePackage(pkg.id, { name: value })}
                  />
                </td>
                <td className="py-2 text-right">
                  <EditableCell
                    value={pkg.priceVnd}
                    width="w-24"
                    onSave={(value) => updatePackage(pkg.id, { priceVnd: Number(value) })}
                  />
                </td>
                <td className="py-2 text-right">
                  <EditableCell
                    value={pkg.baseTokens}
                    width="w-20"
                    onSave={(value) => updatePackage(pkg.id, { baseTokens: Number(value) })}
                  />
                </td>
                <td className="py-2 text-right">
                  <EditableCell
                    value={pkg.bonusTokens}
                    width="w-20"
                    onSave={(value) => updatePackage(pkg.id, { bonusTokens: Number(value) })}
                  />
                </td>
                <td className="py-2 text-right text-brand-500 font-semibold text-xs">
                  {formatNumber(pkg.totalTokens)}
                </td>
                <td className="py-2 text-right text-gray-500 text-xs">{pkg.pricePerToken.toLocaleString('vi-VN')}đ</td>
                <td className="py-2 text-center">
                  <input
                    type="checkbox"
                    checked={pkg.isPopular}
                    onChange={(e) => updatePackage(pkg.id, { isPopular: e.target.checked })}
                    className="accent-brand-500 cursor-pointer"
                  />
                </td>
                <td className="py-2 text-center">
                  <input
                    type="checkbox"
                    checked={pkg.isActive}
                    onChange={(e) => updatePackage(pkg.id, { isActive: e.target.checked })}
                    className="accent-brand-500 cursor-pointer"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
};
