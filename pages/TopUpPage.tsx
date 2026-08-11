import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Alert, Badge, Card, EmptyState, PageLoader, TableWrap } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { countdown, formatDateTime, formatNumber, formatVnd, STATUS_LABEL } from '../lib/format';
import { modelShortName, pickBasisPackage, pickReferenceModel, roundedImageCount } from '../lib/imageEstimate';
import { APP_HOME } from '../lib/routes';
import type { BankInfo, Catalog, ModelOption, Order, TokenPackage } from '../types';

const ORDER_POLL_MS = 5000;

/**
 * Đơn hết hạn vẫn được coi là "đang chờ thanh toán" ở giao diện: nếu khách đã
 * chuyển khoản muộn, webhook vẫn xử lý nên phải để khách nhìn thấy kết quả.
 */
const isAwaitingPayment = (order: Order) => order.status === 'pending' || order.status === 'expired';

export const TopUpPage: React.FC = () => {
  const { refreshUser } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const load = async () => {
    const [catalogData, orderData] = await Promise.all([
      api.get<Catalog>('/catalog'),
      api.get<{ orders: Order[] }>('/orders?limit=20'),
    ]);
    setCatalog(catalogData);
    setOrders(orderData.orders);
    setActiveOrder((current) => current ?? orderData.orders.find((order) => isAwaitingPayment(order)) ?? null);
  };

  useEffect(() => {
    void load().catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu.'));
  }, []);

  // Hỏi server xem webhook đã xử lý đơn chưa.
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

  /** Trả về true nếu đơn được tạo — nơi gọi dùng để biết có nên đóng hộp thoại không. */
  const createOrder = async (path: string, body: unknown, key: string): Promise<boolean> => {
    setError(null);
    setCreatingId(key);
    try {
      const data = await api.post<{ order: Order }>(path, body);
      setActiveOrder(data.order);
      setOrders((current) => [data.order, ...current]);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tạo được đơn hàng.');
      return false;
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

  // Quy số điểm ra số ảnh — con số này dễ hình dung hơn nhiều so với "500.000
  // điểm". Model mốc và cách làm tròn nằm ở lib/imageEstimate để trang này và
  // bảng giá ở trang giới thiệu luôn ra cùng một con số cho cùng một gói.
  const referenceModel = pickReferenceModel(catalog.models);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-100">Mua điểm</h1>
        <Link
          to="/chinh-sach"
          className="text-sm text-gray-500 hover:text-brand-500 transition-colors whitespace-nowrap"
        >
          Chính sách &amp; Điều khoản →
        </Link>
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
        <PaidPanel order={activeOrder} onContinue={() => setActiveOrder(null)} />
      ) : (
        <>
          <BalanceStatus referenceModel={referenceModel} />

          <section>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h2 className="text-lg font-bold text-gray-100">Chọn gói điểm</h2>
              <span className="text-xs text-gray-500">Không phí duy trì · điểm không hết hạn</span>
            </div>

            <PackageGrid
              packages={catalog.packages}
              creatingId={creatingId}
              referenceModel={referenceModel}
              onSelect={(pkg) => createOrder('/orders', { packageId: pkg.id }, `pkg-${pkg.id}`)}
            />
          </section>
        </>
      )}

      <PricingReference catalog={catalog} />
      <OrderHistory orders={orders} onResume={setActiveOrder} />
    </div>
  );
};

// ---------------------------------------------------------------------------

/**
 * Số điểm đang có, quy ra số ảnh tạo được.
 *
 * Khối "hạn mức tháng" chỉ hiện với khách còn gói cũ chưa hết hạn. Khách mới
 * không bao giờ thấy nó — họ chưa từng nghe tới khái niệm hạn mức tháng, bày ra
 * một thanh tiến trình "0 / 0" chỉ khiến họ tưởng mình đang thiếu thứ gì đó.
 */
const BalanceStatus: React.FC<{ referenceModel: ModelOption | null }> = ({ referenceModel }) => {
  const { user } = useAuth();
  if (!user) return null;

  const images =
    referenceModel && referenceModel.tokenCost > 0 ? roundedImageCount(user.tokenBalance, referenceModel.tokenCost) : 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Điểm đang có</p>
          <p className="text-brand-500 font-bold text-2xl mt-1">{formatNumber(user.tokenBalance)}</p>
          {images > 0 && (
            <p className="text-[11px] text-gray-500 mt-1">
              Tạo được khoảng {formatNumber(images)} ảnh {referenceModel?.resolution} với{' '}
              {modelShortName(referenceModel)}
            </p>
          )}
        </div>

        {user.tokenBalance === 0 && (
          <p className="text-sm text-gray-400 max-w-xs">
            Chọn một gói bên dưới để nạp điểm. Chuyển khoản xong là dùng được ngay, không cần đăng ký gì thêm.
          </p>
        )}
      </div>

      {/* Chỉ khách còn gói tháng cũ mới thấy phần này */}
      {user.isSubscribed && user.monthlyAllowance > 0 && (
        <div className="mt-4 pt-4 border-t border-dark-800">
          <p className="text-[11px] text-gray-500">
            Trong đó có <strong className="text-gray-400">{formatNumber(user.monthlyTokens)}</strong> điểm hạn mức từ gói
            tháng cũ của bạn (còn hiệu lực tới {formatDateTime(user.subscriptionExpiresAt)}). Phần này được cấp lại vào{' '}
            {formatDateTime(user.monthlyPeriodEnd)} và <strong className="text-gray-400">không cộng dồn</strong>. Điểm bạn
            mua thêm thì không hết hạn.
          </p>
        </div>
      )}
    </Card>
  );
};

const PackageGrid: React.FC<{
  packages: TokenPackage[];
  creatingId: string | null;
  onSelect: (pkg: TokenPackage) => void;
  /** Model dùng làm mốc quy số điểm ra số ảnh */
  referenceModel: ModelOption | null;
}> = ({ packages, creatingId, onSelect, referenceModel }) => {
  return (
    <>
      {/*
        Flex-wrap chứ không phải grid: có 5 gói mà mỗi hàng 4 cột nên gói cuối
        luôn đứng lẻ. Grid ghim nó vào cột đầu bên trái trông như lỗi bố cục;
        flex + justify-center đưa nó về giữa hàng dưới.

        Bề rộng trừ đi phần khoảng cách: gap-4 = 1rem, 4 cột có 3 khoảng nên mỗi
        thẻ nhường 0,75rem; 2 cột có 1 khoảng nên nhường 0,5rem.
      */}
      <div className="flex flex-wrap justify-center gap-4">
        {packages.map((pkg) => {
          const images =
            referenceModel && referenceModel.tokenCost > 0
              ? roundedImageCount(pkg.totalTokens, referenceModel.tokenCost)
              : 0;

          return (
            <Card
              key={pkg.id}
              className={`p-5 flex flex-col relative w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(25%-0.75rem)] ${pkg.isPopular ? 'border-brand-500 shadow-lg shadow-brand-500/10' : ''}`}
            >
              {pkg.isPopular && (
                <span className="absolute -top-2.5 left-5 bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Phổ biến nhất
                </span>
              )}

              <p className="text-2xl font-bold text-gray-100">{formatVnd(pkg.priceVnd)}</p>
              <p className="text-brand-500 font-bold text-lg mt-2">
                {formatNumber(pkg.totalTokens)} điểm
                {pkg.bonusTokens > 0 && (
                  <span className="text-green-400 text-xs font-semibold ml-1">
                    +{formatNumber(pkg.bonusTokens)}
                  </span>
                )}
              </p>

              <div className="mt-3 pt-3 border-t border-dark-800 flex-1">
                {images > 0 && (
                  <p className="text-gray-200 font-semibold text-sm leading-tight">
                    Tạo được tới {formatNumber(images)} ảnh
                  </p>
                )}
                {pkg.description && <p className="text-[11px] text-gray-500 mt-1">{pkg.description}</p>}
              </div>

              <Button
                onClick={() => onSelect(pkg)}
                isLoading={creatingId === `pkg-${pkg.id}`}
                variant={pkg.isPopular ? 'primary' : 'secondary'}
                className="w-full mt-4 !rounded-xl !py-2.5 !text-sm"
              >
                Mua ngay
              </Button>
            </Card>
          );
        })}
      </div>

      {referenceModel && (
        <p className="text-[11px] text-gray-600 mt-3">
          {/* Số điểm lấy từ bảng giá, không gõ tay — gõ tay là sớm muộn cũng
              lệch với con số thật khi bảng giá đổi. */}
          Số ảnh tính theo <strong className="text-gray-500">{modelShortName(referenceModel)}</strong> ở{' '}
          {referenceModel.resolution} (
          {formatNumber(referenceModel.tokenCost)} điểm/ảnh). Chọn ảnh 1K sẽ được nhiều ảnh hơn, chọn 4K thì ít hơn; xem
          bảng quy đổi bên dưới. Điểm đã mua không hết hạn.
        </p>
      )}
    </>
  );
};

const PaidPanel: React.FC<{ order: Order; onContinue: () => void }> = ({ order, onContinue }) => (
  <Card className="p-6 border-green-900/50 bg-green-500/5">
    <h2 className="text-xl font-bold text-green-400">Thanh toán thành công!</h2>
    {order.orderType === 'subscription' ? (
      <p className="text-sm text-gray-300 mt-2">
        Đơn <strong>{order.code}</strong> đã kích hoạt <strong className="text-gray-100">{order.packageName}</strong>. Bạn
        có thể bắt đầu tạo ảnh ngay.
      </p>
    ) : (
      <p className="text-sm text-gray-300 mt-2">
        Đơn <strong>{order.code}</strong> đã cộng{' '}
        <strong className="text-gray-100">{formatNumber(order.totalTokens)} điểm</strong> vào tài khoản.
      </p>
    )}
    <div className="flex gap-3 mt-5">
      <Link to={APP_HOME}>
        <Button className="!rounded-xl">Bắt đầu tạo ảnh</Button>
      </Link>
      <Button variant="ghost" onClick={onContinue}>
        Mua thêm điểm
      </Button>
    </div>
  </Card>
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
          <h2 className="text-xl font-bold text-gray-100">Chuyển khoản để hoàn tất</h2>
          <p className="text-sm text-gray-500 mt-1">
            {order.orderType === 'subscription'
              ? `${order.packageName} · ${order.subscriptionMonths} tháng`
              : `${order.packageName} · nhận ${formatNumber(order.totalTokens)} điểm`}
          </p>
        </div>
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-100 whitespace-nowrap">
          ← Chọn gói điểm khác
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
            <strong>Bắt buộc</strong> ghi đúng nội dung <strong>{order.transferContent}</strong> để hệ thống xử lý tự
            động. Ghi sai vẫn được xử lý nhưng phải chờ quản trị viên duyệt tay.
          </Alert>

          <div className="flex items-center justify-between mt-4 text-xs">
            <span className="text-gray-500">
              {remaining ? (
                <>
                  Đơn hết hạn sau <strong className="text-amber-400">{remaining}</strong>
                </>
              ) : (
                'Đơn đã quá hạn giữ chỗ — nếu bạn đã chuyển khoản thì vẫn được xử lý bình thường.'
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

/** Bảng điểm tiêu hao mỗi ảnh, để khách ước lượng một gói điểm dùng được bao nhiêu ảnh. */
const PricingReference: React.FC<{ catalog: Catalog }> = ({ catalog }) => {
  // Cột "số ảnh" tính theo gói mốc, và bảng nói rõ tên gói đó. Cách chọn gói mốc
  // nằm ở lib/imageEstimate để bảng model ở trang giới thiệu dùng đúng gói này.
  const basePackage = pickBasisPackage(catalog.packages);
  const baseTokens = basePackage?.totalTokens ?? 0;

  /**
   * Đơn giá điểm để quy ảnh ra tiền, lấy từ chính các gói điểm lẻ đang bán.
   *
   * Dùng đơn giá RẺ NHẤT trong các gói: đây là mức thấp nhất khách có thể mua
   * được, nên con số quy đổi là mức tối thiểu chứ không thổi phồng giá trị gói.
   */
  const pricePerToken =
    catalog.packages.length > 0
      ? Math.min(...catalog.packages.filter((pkg) => pkg.totalTokens > 0).map((pkg) => pkg.priceVnd / pkg.totalTokens))
      : 0;

  // Làm tròn tới trăm đồng cho dễ đọc — đây là giá tham chiếu, không phải giá thu.
  const equivalentPrice = (tokenCost: number) => Math.round((tokenCost * pricePerToken) / 100) * 100;

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-100 mb-3">Bảng quy đổi</h2>
      <Card className="p-4">
        <TableWrap>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
              <th className="text-left font-bold py-2">Model</th>
              <th className="text-left font-bold py-2">Chất lượng</th>
              <th className="text-right font-bold py-2">Điểm / ảnh</th>
              {pricePerToken > 0 && <th className="text-right font-bold py-2">Tiền / ảnh</th>}
              {baseTokens > 0 && (
                <th className="text-right font-bold py-2">Số ảnh với {basePackage?.name ?? 'gói mẫu'}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {catalog.models.map((model) => (
              <tr key={model.code} className="border-b border-dark-850 last:border-0">
                <td className="py-2.5 text-gray-300">{model.label.split('—')[0].trim()}</td>
                <td className="py-2.5 text-gray-400">{model.resolution}</td>
                <td className="py-2.5 text-right text-brand-500 font-semibold">{formatNumber(model.tokenCost)}</td>
                {pricePerToken > 0 && (
                  <td className="py-2.5 text-right text-gray-300">
                    {model.tokenCost > 0 ? formatVnd(equivalentPrice(model.tokenCost)) : '—'}
                  </td>
                )}
                {baseTokens > 0 && (
                  <td className="py-2.5 text-right text-gray-500 text-xs">
                    {/* Dùng chung roundedImageCount với thẻ gói phía trên: cùng
                        một trang mà thẻ ghi "tới 140 ảnh" còn bảng ghi "~147 ảnh"
                        thì khách không biết tin con số nào. */}
                    {model.tokenCost > 0 ? `~${formatNumber(roundedImageCount(baseTokens, model.tokenCost))} ảnh` : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="text-[11px] text-gray-600 mt-3">
          {baseTokens > 0 && (
            <>
              Cột cuối tính trên {formatNumber(baseTokens)} điểm
              {basePackage && ` của ${basePackage.name}`}, nếu chỉ dùng một loại ảnh duy nhất. Mua gói lớn hơn thì số ảnh
              tăng tương ứng.{' '}
            </>
          )}
          {pricePerToken > 0 && (
            <>
              Cột <strong className="text-gray-500">tiền / ảnh</strong> là số tiền thực tế bạn bỏ ra cho mỗi ảnh, tính
              theo đơn giá tốt nhất trong các gói đang bán (
              {pricePerToken.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}đ/điểm).
            </>
          )}
        </p>
      </Card>
    </div>
  );
};

const OrderHistory: React.FC<{ orders: Order[]; onResume: (order: Order) => void }> = ({ orders, onResume }) => (
  <div>
    <h2 className="text-lg font-bold text-gray-100 mb-3">Lịch sử đơn hàng</h2>
    <Card className="p-4">
      {orders.length === 0 ? (
        <EmptyState title="Chưa có đơn hàng nào." />
      ) : (
        <TableWrap>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
              <th className="text-left font-bold py-2">Mã đơn</th>
              <th className="text-left font-bold py-2">Loại</th>
              <th className="text-left font-bold py-2">Nội dung</th>
              <th className="text-right font-bold py-2">Số tiền</th>
              <th className="text-left font-bold py-2 pl-4">Trạng thái</th>
              <th className="text-left font-bold py-2">Thời gian</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-dark-850 last:border-0">
                <td className="py-2.5 font-mono text-xs text-gray-300">{order.code}</td>
                <td className="py-2.5">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    {order.orderType === 'subscription' ? 'Gói tháng' : 'Điểm lẻ'}
                  </span>
                </td>
                <td className="py-2.5 text-gray-300 text-xs">
                  {order.packageName}
                  {order.orderType === 'token_package' && (
                    <span className="text-brand-500 ml-2">+{formatNumber(order.totalTokens)}</span>
                  )}
                </td>
                <td className="py-2.5 text-right text-gray-300">{formatVnd(order.amountVnd)}</td>
                <td className="py-2.5 pl-4">
                  <Badge status={order.status}>{STATUS_LABEL[order.status]}</Badge>
                </td>
                <td className="py-2.5 text-xs text-gray-500">{formatDateTime(order.createdAt)}</td>
                <td className="py-2.5 text-right">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => onResume(order)}
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
);
