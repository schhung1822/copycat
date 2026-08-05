import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Alert, Badge, Card, EmptyState, PageLoader, TableWrap } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { countdown, formatDateTime, formatNumber, formatVnd, STATUS_LABEL } from '../lib/format';
import type { BankInfo, Catalog, Order, TokenPackage } from '../types';

const ORDER_POLL_MS = 5000;

/**
 * Đơn hết hạn vẫn được coi là "đang chờ thanh toán" ở giao diện: nếu khách đã
 * chuyển khoản muộn, webhook vẫn cộng token nên phải để khách nhìn thấy kết quả.
 */
const isAwaitingPayment = (order: Order) => order.status === 'pending' || order.status === 'expired';

export const TopUpPage: React.FC = () => {
  const { refreshUser } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<number | null>(null);

  const load = async () => {
    const [catalogData, orderData] = await Promise.all([
      api.get<Catalog>('/catalog'),
      api.get<{ orders: Order[] }>('/orders?limit=20'),
    ]);
    setCatalog(catalogData);
    setOrders(orderData.orders);
    // Nếu còn đơn chưa thanh toán thì mở lại luôn màn hình chuyển khoản.
    setActiveOrder((current) => current ?? orderData.orders.find((order) => isAwaitingPayment(order)) ?? null);
  };

  useEffect(() => {
    void load().catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu.'));
  }, []);

  // Hỏi server xem webhook đã cộng token chưa.
  useEffect(() => {
    if (!activeOrder || !isAwaitingPayment(activeOrder)) return;

    const timer = setInterval(() => {
      void (async () => {
        try {
          const data = await api.get<{ order: Order }>(`/orders/${activeOrder.code}`);
          setActiveOrder(data.order);
          if (!isAwaitingPayment(data.order)) {
            setOrders((current) => current.map((item) => (item.id === data.order.id ? data.order : item)));
            await refreshUser();
          }
        } catch {
          /* thử lại ở lần sau */
        }
      })();
    }, ORDER_POLL_MS);

    return () => clearInterval(timer);
  }, [activeOrder, refreshUser]);

  const handleCreateOrder = async (pkg: TokenPackage) => {
    setError(null);
    setCreatingId(pkg.id);
    try {
      const data = await api.post<{ order: Order }>('/orders', { packageId: pkg.id });
      setActiveOrder(data.order);
      setOrders((current) => [data.order, ...current]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tạo được đơn nạp.');
    } finally {
      setCreatingId(null);
    }
  };

  const handleCancel = async (order: Order) => {
    try {
      await api.post(`/orders/${order.id}/cancel`);
      setActiveOrder(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không huỷ được đơn.');
    }
  };

  if (!catalog) return <PageLoader />;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Nạp token</h1>
        <p className="text-sm text-gray-500 mt-1">
          Token dùng để tạo ảnh. Gói càng lớn, giá mỗi token càng rẻ.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {activeOrder && isAwaitingPayment(activeOrder) ? (
        <PaymentPanel
          order={activeOrder}
          bank={catalog.bank}
          onCancel={() => handleCancel(activeOrder)}
          onBack={() => setActiveOrder(null)}
        />
      ) : activeOrder && activeOrder.status === 'paid' ? (
        <Card className="p-6 border-green-900/50 bg-green-500/5">
          <h2 className="text-xl font-bold text-green-400">Nạp thành công!</h2>
          <p className="text-sm text-gray-300 mt-2">
            Đơn <strong>{activeOrder.code}</strong> đã được cộng{' '}
            <strong className="text-white">{formatNumber(activeOrder.totalTokens)} token</strong> vào tài khoản.
          </p>
          <div className="flex gap-3 mt-5">
            <Link to="/">
              <Button className="!rounded-xl">Bắt đầu tạo ảnh</Button>
            </Link>
            <Button variant="ghost" onClick={() => setActiveOrder(null)}>
              Nạp thêm
            </Button>
          </div>
        </Card>
      ) : (
        <PackageGrid packages={catalog.packages} creatingId={creatingId} onSelect={handleCreateOrder} />
      )}

      <PricingReference catalog={catalog} />

      <div>
        <h2 className="text-lg font-bold text-white mb-3">Lịch sử nạp tiền</h2>
        <Card className="p-4">
          {orders.length === 0 ? (
            <EmptyState title="Chưa có đơn nạp nào." />
          ) : (
            <TableWrap>
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                  <th className="text-left font-bold py-2">Mã đơn</th>
                  <th className="text-left font-bold py-2">Gói</th>
                  <th className="text-right font-bold py-2">Số tiền</th>
                  <th className="text-right font-bold py-2">Token</th>
                  <th className="text-left font-bold py-2 pl-4">Trạng thái</th>
                  <th className="text-left font-bold py-2">Thời gian</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-dark-850 last:border-0">
                    <td className="py-2.5 font-mono text-xs text-gray-300">{order.code}</td>
                    <td className="py-2.5 text-gray-300">{order.packageName}</td>
                    <td className="py-2.5 text-right text-gray-300">{formatVnd(order.amountVnd)}</td>
                    <td className="py-2.5 text-right text-brand-500 font-semibold">
                      +{formatNumber(order.totalTokens)}
                    </td>
                    <td className="py-2.5 pl-4">
                      <Badge status={order.status}>{STATUS_LABEL[order.status]}</Badge>
                    </td>
                    <td className="py-2.5 text-xs text-gray-500">{formatDateTime(order.createdAt)}</td>
                    <td className="py-2.5 text-right">
                      {order.status === 'pending' && (
                        <button
                          onClick={() => setActiveOrder(order)}
                          className="text-xs text-brand-500 hover:underline whitespace-nowrap"
                        >
                          Thanh toán →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const PackageGrid: React.FC<{
  packages: TokenPackage[];
  creatingId: number | null;
  onSelect: (pkg: TokenPackage) => void;
}> = ({ packages, creatingId, onSelect }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
    {packages.map((pkg) => (
      <Card
        key={pkg.id}
        className={`p-5 flex flex-col relative ${pkg.isPopular ? 'border-brand-500 shadow-lg shadow-brand-500/10' : ''}`}
      >
        {pkg.isPopular && (
          <span className="absolute -top-2.5 left-5 bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
            Phổ biến
          </span>
        )}

        <h3 className="font-bold text-white">{pkg.name}</h3>
        <p className="text-2xl font-bold text-white mt-2">{formatVnd(pkg.priceVnd)}</p>

        <div className="mt-3 pb-3 border-b border-dark-800">
          <p className="text-brand-500 font-bold text-lg">{formatNumber(pkg.totalTokens)} token</p>
          {pkg.bonusTokens > 0 && (
            <p className="text-[11px] text-green-400 mt-0.5">
              gồm {formatNumber(pkg.bonusTokens)} token thưởng (+{pkg.bonusPercent}%)
            </p>
          )}
        </div>

        <p className="text-[11px] text-gray-500 mt-3 flex-1">{pkg.description}</p>
        <p className="text-[11px] text-gray-600 mt-2">≈ {pkg.pricePerToken.toLocaleString('vi-VN')}đ / token</p>

        <Button
          onClick={() => onSelect(pkg)}
          isLoading={creatingId === pkg.id}
          variant={pkg.isPopular ? 'primary' : 'secondary'}
          className="w-full mt-4 !rounded-xl !py-2.5 !text-sm"
        >
          Chọn gói
        </Button>
      </Card>
    ))}
  </div>
);

const PaymentPanel: React.FC<{
  order: Order;
  bank: BankInfo;
  onCancel: () => void;
  onBack: () => void;
}> = ({ order, bank, onCancel, onBack }) => {
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = useMemo(() => countdown(order.expiresAt, now), [order.expiresAt, now]);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* trình duyệt chặn clipboard — khách vẫn đọc và gõ tay được */
    }
  };

  const Row: React.FC<{ label: string; value: string; copyKey?: string; highlight?: boolean }> = ({
    label,
    value,
    copyKey,
    highlight,
  }) => (
    <div className="flex justify-between items-center gap-3 py-2.5 border-b border-dark-850 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-sm truncate ${highlight ? 'font-bold text-brand-500' : 'text-gray-200'}`}>{value}</span>
        {copyKey && (
          <button
            onClick={() => copy(value, copyKey)}
            className="text-[10px] bg-dark-800 hover:bg-dark-700 text-gray-400 px-2 py-1 rounded shrink-0 transition-colors"
          >
            {copied === copyKey ? 'Đã chép' : 'Chép'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold text-white">Chuyển khoản để nhận token</h2>
          <p className="text-sm text-gray-500 mt-1">
            Gói {order.packageName} · nhận {formatNumber(order.totalTokens)} token
          </p>
        </div>
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-white whitespace-nowrap">
          ← Chọn gói khác
        </button>
      </div>

      {!bank.configured && (
        <Alert tone="warning">
          Quản trị viên chưa cấu hình tài khoản ngân hàng nhận tiền (BANK_ACCOUNT_NUMBER trong file .env).
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div className="flex flex-col items-center justify-center">
          {order.qrUrl ? (
            <>
              <img
                src={order.qrUrl}
                alt="Mã QR chuyển khoản"
                className="w-full max-w-[280px] rounded-xl border border-dark-700 bg-white"
              />
              <p className="text-[11px] text-gray-500 mt-3 text-center">
                Quét bằng app ngân hàng — số tiền và nội dung đã điền sẵn.
              </p>
            </>
          ) : (
            <div className="w-full max-w-[280px] aspect-square rounded-xl border border-dashed border-dark-700 flex items-center justify-center text-xs text-gray-600 text-center p-6">
              Chưa cấu hình tài khoản ngân hàng nên không tạo được mã QR.
            </div>
          )}
        </div>

        <div>
          <div className="bg-dark-850 rounded-xl px-4 divide-y divide-dark-800">
            <Row label="Ngân hàng" value={bank.bankName || bank.bankCode} />
            <Row label="Số tài khoản" value={bank.accountNumber} copyKey="account" />
            <Row label="Chủ tài khoản" value={bank.accountName} />
            <Row label="Số tiền" value={formatVnd(order.amountVnd)} copyKey="amount" highlight />
            <Row label="Nội dung CK" value={order.transferContent} copyKey="content" highlight />
          </div>

          <Alert tone="warning">
            <strong>Bắt buộc</strong> ghi đúng nội dung <strong>{order.transferContent}</strong> để hệ thống cộng token
            tự động. Ghi sai vẫn nhận được token nhưng phải chờ quản trị viên duyệt tay.
          </Alert>

          <div className="flex items-center justify-between mt-4 text-xs">
            <span className="text-gray-500">
              {remaining ? (
                <>
                  Đơn hết hạn sau <strong className="text-amber-400">{remaining}</strong>
                </>
              ) : (
                'Đơn đã quá hạn giữ chỗ — nếu bạn đã chuyển khoản thì token vẫn được cộng bình thường.'
              )}
            </span>
            {order.status === 'pending' && (
              <button onClick={onCancel} className="text-gray-500 hover:text-red-400 transition-colors">
                Huỷ đơn
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-5 text-sm text-brand-500">
            <span className="inline-block w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            Đang chờ ngân hàng báo có...
          </div>
        </div>
      </div>
    </Card>
  );
};

/** Bảng giá token cho từng loại ảnh, để khách ước lượng nạp bao nhiêu là đủ. */
const PricingReference: React.FC<{ catalog: Catalog }> = ({ catalog }) => (
  <div>
    <h2 className="text-lg font-bold text-white mb-3">Token tiêu hao mỗi ảnh</h2>
    <Card className="p-4">
      <TableWrap>
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
            <th className="text-left font-bold py-2">Model</th>
            <th className="text-left font-bold py-2">Chất lượng</th>
            <th className="text-right font-bold py-2">Token / ảnh</th>
            <th className="text-right font-bold py-2">Tương đương</th>
          </tr>
        </thead>
        <tbody>
          {catalog.models.map((model) => (
            <tr key={model.code} className="border-b border-dark-850 last:border-0">
              <td className="py-2.5 text-gray-300">{model.label.split('—')[0].trim()}</td>
              <td className="py-2.5 text-gray-400">{model.resolution}</td>
              <td className="py-2.5 text-right text-brand-500 font-semibold">{model.tokenCost}</td>
              <td className="py-2.5 text-right text-gray-500 text-xs">{formatVnd(model.tokenCost * 100)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <p className="text-[11px] text-gray-600 mt-3">
        Giá tương đương tính theo mệnh giá 100đ/token của gói nhỏ nhất. Mua gói lớn sẽ rẻ hơn mức này.
      </p>
    </Card>
  </div>
);
