import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Alert, Badge, Card, EmptyState, PageLoader, TableWrap } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { countdown, formatDateTime, formatNumber, formatVnd, STATUS_LABEL } from '../lib/format';
import type {
  BankInfo,
  Catalog,
  ModelOption,
  Order,
  SubscriptionPlan,
  TokenPackage,
  UpgradeInfo,
  UpgradeOption,
} from '../types';

const ORDER_POLL_MS = 5000;

/**
 * Đơn hết hạn vẫn được coi là "đang chờ thanh toán" ở giao diện: nếu khách đã
 * chuyển khoản muộn, webhook vẫn xử lý nên phải để khách nhìn thấy kết quả.
 */
const isAwaitingPayment = (order: Order) => order.status === 'pending' || order.status === 'expired';

/**
 * Bội số làm tròn số ảnh hiển thị trên thẻ gói.
 *
 * Đang để 10. Đổi thành 100 nếu muốn số tròn trăm — nhưng lưu ý với hạn mức hiện
 * tại thì gói 1 tháng và 3 tháng sẽ cùng ra "300 ảnh", hai thẻ nhìn y hệt nhau.
 */
const IMAGE_COUNT_STEP = 10;

/**
 * Model dùng làm mốc quy đổi hạn mức ra số ảnh trên thẻ gói.
 *
 * Phải trùng với model ghi ở dòng chú thích dưới lưới, nếu không số ảnh hiển thị
 * sẽ không khớp với lời giải thích — khách đọc "tính theo Nano Banana 2" nhưng
 * con số lại tính bằng model rẻ hơn là thành hứa quá.
 *
 * Nếu bảng giá không còn model này thì lùi về model rẻ nhất cùng độ phân giải.
 */
const REFERENCE_MODEL = { family: 'nano-banana-2', resolution: '2K' };

/**
 * Quy hạn mức token ra số ảnh, làm tròn XUỐNG cho số gọn mắt.
 *
 * Luôn làm tròn xuống chứ không làm tròn gần nhất: làm tròn lên sẽ hứa nhiều ảnh
 * hơn số hạn mức thật sự cho phép (vd 357 ảnh mà ghi 400), khách tạo tới ảnh thứ
 * 358 là hết token và có cơ sở khiếu nại.
 */
function roundedImageCount(allowance: number, tokenCostPerImage: number): number {
  const exact = Math.floor(allowance / tokenCostPerImage);
  // Hạn mức quá nhỏ để làm tròn thì giữ nguyên con số thật, tránh hiển thị 0.
  if (exact < IMAGE_COUNT_STEP) return exact;
  return Math.floor(exact / IMAGE_COUNT_STEP) * IMAGE_COUNT_STEP;
}

export const TopUpPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [upgrade, setUpgrade] = useState<UpgradeInfo | null>(null);
  /** Gói khách vừa bấm "Nâng gói" — mở hộp thoại xem chi tiết trước khi tạo đơn. */
  const [upgradeTarget, setUpgradeTarget] = useState<UpgradeOption | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const load = async () => {
    const [catalogData, orderData, upgradeData] = await Promise.all([
      api.get<Catalog>('/catalog'),
      api.get<{ orders: Order[] }>('/orders?limit=20'),
      api.get<UpgradeInfo>('/orders/upgrade-options'),
    ]);
    setCatalog(catalogData);
    setOrders(orderData.orders);
    setUpgrade(upgradeData);
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

  /**
   * Tạo đơn nâng gói rồi đóng hộp thoại.
   *
   * Chỉ đóng khi tạo đơn thành công — nếu lỗi (gói hết hiệu lực giữa chừng, số
   * tiền bù quá nhỏ) thì giữ hộp thoại lại để khách còn thấy mình đã bấm gì.
   */
  const handleUpgrade = async (option: UpgradeOption) => {
    const created = await createOrder('/orders/upgrade', { planId: option.planId }, `upgrade-${option.planId}`);
    if (created) setUpgradeTarget(null);
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

  const isSubscribed = user?.isSubscribed ?? false;

  // Quy hạn mức ra số ảnh — con số này dễ hình dung hơn nhiều so với "500.000
  // token". Mốc quy đổi lấy đúng model ghi trên thẻ (REFERENCE_MODEL), nếu không
  // số hiển thị sẽ không khớp với dòng chú thích bên dưới.
  const cheapestOf = (list: ModelOption[]) =>
    list.reduce<ModelOption | null>(
      (cheapest, model) =>
        model.tokenCost > 0 && (!cheapest || model.tokenCost < cheapest.tokenCost) ? model : cheapest,
      null,
    );
  const referenceModel =
    catalog.models.find(
      (model) =>
        model.family === REFERENCE_MODEL.family &&
        model.resolution === REFERENCE_MODEL.resolution &&
        model.tokenCost > 0,
    ) ??
    cheapestOf(catalog.models.filter((model) => model.resolution === REFERENCE_MODEL.resolution)) ??
    cheapestOf(catalog.models);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-100">Gói dịch vụ</h1>
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
          <SubscriptionStatus />

          <section>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h2 className="text-lg font-bold text-gray-100">
                {isSubscribed ? 'Gói dịch vụ' : 'Chọn gói dịch vụ'}
              </h2>
              <span className="text-xs text-gray-500">
                {isSubscribed ? 'Nâng gói cao hơn chỉ cần bù phần chênh lệch' : 'Tiết kiệm hơn với gói chu kỳ dài'}
              </span>
            </div>
            <PlanGrid
              plans={catalog.plans}
              creatingId={creatingId}
              referenceModel={referenceModel}
              upgrade={upgrade}
              onSelect={(plan) => createOrder('/orders/subscription', { planId: plan.id }, `plan-${plan.id}`)}
              onUpgrade={(option) => {
                // Xoá lỗi cũ trước khi mở, nếu không hộp thoại mở ra đã thấy lỗi của lần trước.
                setError(null);
                setUpgradeTarget(option);
              }}
            />
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h2 className="text-lg font-bold text-gray-100">Mua thêm token</h2>
              <span className="text-xs text-gray-500">Token mua thêm không hết hạn theo tháng</span>
            </div>

            {isSubscribed ? (
              <PackageGrid
                packages={catalog.packages}
                creatingId={creatingId}
                allowance={catalog.plans[0]?.monthlyTokenAllowance ?? 0}
                onSelect={(pkg) => createOrder('/orders', { packageId: pkg.id }, `pkg-${pkg.id}`)}
              />
            ) : (
              <Card className="p-6">
                <p className="text-sm text-gray-400">
                  Cần có gói dịch vụ đang hoạt động mới mua thêm token được. Hãy chọn một gói ở phần trên.
                </p>
              </Card>
            )}
          </section>
        </>
      )}

      <PricingReference catalog={catalog} />
      <OrderHistory orders={orders} onResume={setActiveOrder} />

      {upgradeTarget && (
        <UpgradeDialog
          option={upgradeTarget}
          currentPlanName={upgrade?.currentPlan?.name ?? 'gói hiện tại'}
          isSubmitting={creatingId === `upgrade-${upgradeTarget.planId}`}
          error={error}
          onClose={() => setUpgradeTarget(null)}
          onConfirm={() => void handleUpgrade(upgradeTarget)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

/** Nhắc trạng thái gói hiện tại: còn hạn tới bao giờ, hạn mức còn bao nhiêu. */
const SubscriptionStatus: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;

  if (!user.isSubscribed) {
    return (
      <Alert tone="warning">
        Bạn <strong>chưa có gói dịch vụ</strong> nên chưa tạo được ảnh. Chọn một gói bên dưới để bắt đầu.
      </Alert>
    );
  }

  const usedPercent =
    user.monthlyAllowance > 0
      ? Math.round(((user.monthlyAllowance - user.monthlyTokens) / user.monthlyAllowance) * 100)
      : 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Gói đang dùng</p>
          <p className="text-gray-100 font-semibold mt-1">
            Còn hiệu lực tới {formatDateTime(user.subscriptionExpiresAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Hạn mức tháng còn lại</p>
          <p className="text-brand-500 font-bold text-lg mt-1">
            {formatNumber(user.monthlyTokens)}
            <span className="text-gray-600 text-sm font-normal"> / {formatNumber(user.monthlyAllowance)}</span>
          </p>
        </div>
      </div>

      <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden mt-4">
        <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${usedPercent}%` }} />
      </div>

      <p className="text-[11px] text-gray-500 mt-2">
        Hạn mức được cấp lại vào {formatDateTime(user.monthlyPeriodEnd)}.{' '}
        <strong className="text-gray-400">Không cộng dồn</strong> — phần chưa dùng của tháng này sẽ mất khi sang chu kỳ mới.
        {user.purchasedTokens > 0 && (
          <> Ngoài ra bạn còn {formatNumber(user.purchasedTokens)} token mua thêm, phần này không hết hạn.</>
        )}
      </p>
    </Card>
  );
};

const PlanGrid: React.FC<{
  plans: SubscriptionPlan[];
  creatingId: string | null;
  onSelect: (plan: SubscriptionPlan) => void;
  /** Model rẻ nhất đang bán — dùng làm mốc quy đổi hạn mức ra số ảnh */
  referenceModel: ModelOption | null;
  /** Thông tin nâng gói; null khi khách chưa có gói nào */
  upgrade: UpgradeInfo | null;
  onUpgrade: (option: UpgradeOption) => void;
}> = ({ plans, creatingId, onSelect, referenceModel, upgrade, onUpgrade }) => {
  // Mốc so sánh để tính % tiết kiệm: giá mỗi tháng của gói ngắn nhất.
  const basePerMonth = Math.max(...plans.map((plan) => plan.pricePerMonthVnd), 0);

  // "Nano Banana 2 — 2K" -> "Nano Banana 2". Lấy từ bảng giá chứ không gõ tay,
  // để đổi model mốc là chữ trên thẻ tự đổi theo.
  const modelShortName = referenceModel?.label.split('—')[0].trim() ?? '';

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {plans.map((plan) => {
        const savedPercent = basePerMonth > 0 ? Math.round((1 - plan.pricePerMonthVnd / basePerMonth) * 100) : 0;

        // Gói này có nâng lên được không, và có phải gói đang dùng không.
        const upgradeOption = upgrade?.options.find((option) => option.planId === plan.id) ?? null;
        const isCurrentPlan = upgrade?.currentPlan?.planId === plan.id;

        return (
          <Card
            key={plan.id}
            className={`p-5 flex flex-col relative ${plan.isPopular ? 'border-brand-500 shadow-lg shadow-brand-500/10' : ''}`}
          >
            {plan.isPopular && (
              <span className="absolute -top-2.5 left-5 bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Đáng tiền nhất
              </span>
            )}
            {savedPercent > 0 && (
              <span className="absolute -top-2.5 right-5 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                −{savedPercent}%
              </span>
            )}

            <h3 className="font-bold text-gray-100">{plan.name}</h3>
            <p className="text-2xl font-bold text-gray-100 mt-2">{formatVnd(plan.priceVnd)}</p>
            {/* <p className="text-[11px] text-gray-500 mt-1">
              {plan.months > 1 ? `${formatVnd(plan.pricePerMonthVnd)}/tháng` : 'thanh toán hàng tháng'}
            </p> */}
            <p className="text-[11px] text-gray-600 mt-1">
              {formatNumber(plan.monthlyTokenAllowance)} token/tháng
            </p>

            <div className="mt-3 pt-3 border-t border-dark-800 flex-1">
              {referenceModel && referenceModel.tokenCost > 0 ? (
                (() => {
                  const perMonth = roundedImageCount(plan.monthlyTokenAllowance, referenceModel.tokenCost);
                  return (
                    <>
                      {/* Bọc phép nhân BÊN TRONG formatNumber: formatNumber trả về
                          chuỗi, nhân chuỗi với số sẽ mất dấu phân cách nghìn và cho
                          kết quả sai hẳn khi số vượt 1.000 ("1.170" * 3 = 3.51). */}
                      <p className="text-brand-500 font-bold text-xl leading-tight">
                        Miễn phí {formatNumber(perMonth * plan.months)} ảnh
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Ảnh có độ phân giải {referenceModel.resolution} - {modelShortName}
                      </p>
                    </>
                  );
                })()
              ) : (
                <p className="text-brand-500 font-bold">{formatNumber(plan.monthlyTokenAllowance)} token/tháng</p>
              )}
            </div>

            {/* Ba trạng thái: gói đang dùng / gói nâng lên được / gói mua hoặc gia hạn bình thường */}
            {isCurrentPlan ? (
              <div className="w-full mt-4 rounded-xl py-2.5 text-sm font-bold text-center bg-dark-850 border border-dark-700 text-gray-500">
                Gói đang dùng
              </div>
            ) : upgradeOption ? (
              <Button
                onClick={() => onUpgrade(upgradeOption)}
                variant="primary"
                className="w-full mt-4 !rounded-xl !py-2.5 !text-sm"
              >
                Nâng cấp gói
              </Button>
            ) : (
              <Button
                onClick={() => onSelect(plan)}
                isLoading={creatingId === `plan-${plan.id}`}
                variant={plan.isPopular ? 'primary' : 'secondary'}
                className="w-full mt-4 !rounded-xl !py-2.5 !text-sm"
              >
                {/* Đang có gói mà bấm thẻ khác thì không phải đổi gói — server nối
                    thêm đúng số tháng của thẻ đó vào ngày hết hạn hiện tại. Ghi rõ
                    "+N tháng" để khách không hiểu nhầm là chuyển sang gói đó. */}
                {upgrade?.currentPlan ? `Gia hạn thêm ${plan.months} tháng` : 'Chọn gói'}
              </Button>
            )}
          </Card>
        );
      })}
      </div>

      {referenceModel && (
        <p className="text-[11px] text-gray-600 mt-3">
          {/* Số token lấy từ bảng giá, không gõ tay — gõ tay là sớm muộn cũng
              lệch với con số thật khi bảng giá đổi. */}
          Số ảnh tính theo <strong className="text-gray-500">{modelShortName}</strong> (
          {formatNumber(referenceModel.tokenCost)} token/ảnh). Chọn ảnh 1K sẽ được nhiều ảnh hơn, chọn 4K thì ít hơn;
          xem bảng token tiêu hao bên dưới. Hạn mức tính theo từng tháng và không cộng dồn.
        </p>
      )}
    </>
  );
};

/**
 * Hộp thoại xác nhận nâng gói.
 *
 * Bày rõ ba con số — giá gói mới, phần được trừ, số phải bù — để khách tự cộng
 * lại kiểm chứng được, rồi mới cho bấm thanh toán.
 */
const UpgradeDialog: React.FC<{
  option: UpgradeOption;
  currentPlanName: string;
  isSubmitting: boolean;
  /** Lỗi tạo đơn — phải hiện trong hộp thoại, banner ở trang bị lớp phủ che mất. */
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ option, currentPlanName, isSubmitting, error, onClose, onConfirm }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
    <Card className="w-full max-w-md p-6">
      <h3 className="text-xl font-bold text-gray-100">Nâng lên {option.name}</h3>
      <p className="text-sm text-gray-500 mt-1">Từ {currentPlanName}</p>

      <div className="mt-5 bg-dark-850 rounded-xl px-4 divide-y divide-dark-800">
        <div className="flex justify-between items-center py-3">
          <span className="text-sm text-gray-400">Giá {option.name}</span>
          <span className="text-sm text-gray-200">{formatVnd(option.listPriceVnd)}</span>
        </div>
        <div className="flex justify-between items-center py-3">
          <div>
            <span className="text-sm text-gray-400">Trừ phần chưa dùng</span>
            <span className="block text-[11px] text-gray-600 mt-0.5">
              Gói hiện tại còn {option.remainingDays}/{option.totalDays} ngày
            </span>
          </div>
          <span className="text-sm text-green-400">−{formatVnd(option.creditVnd)}</span>
        </div>
        <div className="flex justify-between items-center py-3">
          <span className="text-sm font-bold text-gray-100">Số tiền cần thanh toán</span>
          <span className="text-lg font-bold text-brand-500">{formatVnd(option.payableVnd)}</span>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Alert tone="info">
        Sau khi thanh toán thành công, gói {option.months} tháng bắt đầu tính từ thời điểm đó và hạn mức được cấp lại{' '}
        {formatNumber(option.monthlyTokenAllowance)} token/tháng. Hạn mức chưa dùng của gói cũ đã được quy thành tiền
        trừ vào đơn này.
      </Alert>

      <div className="flex justify-end gap-3 mt-5">
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Để sau
        </Button>
        <Button onClick={onConfirm} isLoading={isSubmitting} className="!rounded-xl">
          Bắt đầu thanh toán
        </Button>
      </div>
    </Card>
  </div>
);

const PackageGrid: React.FC<{
  packages: TokenPackage[];
  creatingId: string | null;
  onSelect: (pkg: TokenPackage) => void;
  /** Hạn mức tháng, dùng làm mốc so sánh cho khách dễ hình dung */
  allowance: number;
}> = ({ packages, creatingId, onSelect, allowance }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {packages.map((pkg) => {
      const ratio = allowance > 0 ? pkg.totalTokens / allowance : 0;

      return (
        <Card key={pkg.id} className={`p-5 flex flex-col ${pkg.isPopular ? 'border-brand-500/60' : ''}`}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-bold text-gray-100">{pkg.name}</h3>
            {ratio > 0 && (
              <span className="text-[10px] text-gray-500 whitespace-nowrap">
                {ratio >= 1 ? `${ratio}×` : `${Math.round(ratio * 100)}%`} hạn mức
              </span>
            )}
          </div>

          <p className="text-brand-500 font-bold text-lg mt-2">{formatNumber(pkg.totalTokens)} token</p>
          <p className="text-[11px] text-gray-500 mt-1 flex-1">{pkg.description}</p>

          <Button
            onClick={() => onSelect(pkg)}
            isLoading={creatingId === `pkg-${pkg.id}`}
            variant="secondary"
            className="w-full mt-4 !rounded-xl !py-2.5 !text-sm"
          >
            Mua {formatVnd(pkg.priceVnd)}
          </Button>
        </Card>
      );
    })}
  </div>
);

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
        <strong className="text-gray-100">{formatNumber(order.totalTokens)} token</strong> vào tài khoản.
      </p>
    )}
    <div className="flex gap-3 mt-5">
      <Link to="/">
        <Button className="!rounded-xl">Bắt đầu tạo ảnh</Button>
      </Link>
      <Button variant="ghost" onClick={onContinue}>
        Quay lại bảng giá
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
              : `${order.packageName} · nhận ${formatNumber(order.totalTokens)} token`}
          </p>
        </div>
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-100 whitespace-nowrap">
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

/** Bảng token tiêu hao mỗi ảnh, để khách ước lượng hạn mức dùng được bao nhiêu ảnh. */
const PricingReference: React.FC<{ catalog: Catalog }> = ({ catalog }) => {
  // Các gói có thể có hạn mức khác nhau, nên phải nói rõ bảng đang tính theo gói nào.
  const basePlan = catalog.plans[0] ?? null;
  const allowance = basePlan?.monthlyTokenAllowance ?? 0;

  /**
   * Đơn giá token để quy ảnh ra tiền, lấy từ chính các gói token lẻ đang bán.
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
              <th className="text-right font-bold py-2">Token / ảnh</th>
              {pricePerToken > 0 && <th className="text-right font-bold py-2">Quy đổi theo mệnh giá</th>}
              <th className="text-right font-bold py-2">Số ảnh trong hạn mức tháng</th>
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
                <td className="py-2.5 text-right text-gray-500 text-xs">
                  {model.tokenCost > 0 ? `~${formatNumber(Math.floor(allowance / model.tokenCost))} ảnh` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="text-[11px] text-gray-600 mt-3">
          Cột cuối tính trên hạn mức {formatNumber(allowance)} token/tháng
          {basePlan && ` của ${basePlan.name}`}, nếu chỉ dùng một loại ảnh duy nhất. Gói có hạn mức cao hơn thì số ảnh
          tăng tương ứng.
          {pricePerToken > 0 && (
            <>
              {' '}
              Cột <strong className="text-gray-500">tiền tương đương</strong> là số tiền bạn phải bỏ ra cho mỗi ảnh nếu
              mua token lẻ, tính theo đơn giá tốt nhất trong các gói token đang bán (
              {pricePerToken.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}đ/token). Token trong gói dịch vụ đã
              bao gồm sẵn, không phải trả thêm.
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
                    {order.orderType === 'subscription' ? 'Gói tháng' : 'Token lẻ'}
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
