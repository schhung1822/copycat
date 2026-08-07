import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { Alert, Card, PageLoader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatNumber, formatVnd } from '../lib/format';
import type { Catalog } from '../types';

/**
 * Trang Chính sách & Điều khoản.
 *
 * Mọi con số nghiệp vụ (hạn mức tháng, chu kỳ gói, giá, thời hạn đơn) đều đọc từ
 * API bảng giá chứ không viết cứng, để chính sách không bao giờ mâu thuẫn với giá
 * đang bán thật khi admin chỉnh bảng giá.
 *
 * Trang này KHÔNG yêu cầu đăng nhập — khách cần đọc được điều khoản trước khi
 * quyết định tạo tài khoản.
 */

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  // scroll-mt để tiêu đề không bị thanh trên đang dính che mất khi bấm vào mục lục
  <section id={id} className="scroll-mt-24">
    <h2 className="text-lg font-bold text-gray-100 mb-2">{title}</h2>
    <div className="space-y-2 text-sm text-gray-400 leading-relaxed">{children}</div>
  </section>
);

const SECTIONS = [
  { id: 'dich-vu', label: 'Về dịch vụ' },
  { id: 'tai-khoan', label: 'Tài khoản' },
  { id: 'goi-cuoc', label: 'Gói dịch vụ & hạn mức' },
  { id: 'diem-le', label: 'Điểm mua thêm' },
  { id: 'thanh-toan', label: 'Thanh toán' },
  { id: 'hoan-tra', label: 'Hoàn điểm & hoàn tiền' },
  { id: 'noi-dung', label: 'Nội dung & bản quyền' },
  { id: 'cam', label: 'Hành vi bị cấm' },
  { id: 'du-lieu', label: 'Dữ liệu & bảo mật' },
  { id: 'trach-nhiem', label: 'Giới hạn trách nhiệm' },
  { id: 'thay-doi', label: 'Thay đổi điều khoản' },
  { id: 'lien-he', label: 'Liên hệ' },
];

export const PolicyPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    void api.get<Catalog>('/catalog').then(setCatalog).catch(() => setCatalog(null));
  }, []);

  /**
   * Làm nổi bật mục đang đọc ở cột trái.
   *
   * `rootMargin` phía trên trừ đi chiều cao thanh trên đang dính, nếu không mục sẽ
   * được coi là "đang xem" khi vẫn còn nằm khuất sau thanh đó.
   * Chỉ chạy sau khi có dữ liệu, vì trước đó các thẻ <section> chưa được vẽ ra.
   */
  useEffect(() => {
    if (!catalog) return;

    const elements = SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => element !== null,
    );
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-88px 0px -55% 0px', threshold: 0 },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [catalog]);

  if (!catalog) return <PageLoader label="Đang tải chính sách..." />;

  const { site, plans, packages, models } = catalog;
  const allowance = plans[0]?.monthlyTokenAllowance ?? 0;
  const cycles = plans.map((plan) => plan.months).join(', ');
  const cheapest = models.reduce<(typeof models)[number] | null>(
    (best, model) => (model.tokenCost > 0 && (!best || model.tokenCost < best.tokenCost) ? model : best),
    null,
  );
  const missingContact = !site.companyName && !site.supportEmail && !site.supportPhone;

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Thanh trên gọn nhẹ: trang này dùng được cả khi chưa đăng nhập */}
      <header className="h-14 border-b border-dark-800 bg-dark-900/95 backdrop-blur sticky top-0 z-40 flex items-center px-4 gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-400 hover:text-gray-100 transition-colors whitespace-nowrap"
        >
          ← Quay lại
        </button>
        <span className="font-bold text-gray-100 truncate">Chính sách &amp; Điều khoản</span>

        <div className="ml-auto flex items-center gap-3">
          <Link to={user ? '/nap-tien' : '/dang-nhap'} className="text-sm text-brand-500 hover:underline whitespace-nowrap">
            {user ? 'Gói dịch vụ' : 'Đăng nhập'}
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-100">Chính sách &amp; Điều khoản sử dụng</h1>
          <p className="text-sm text-gray-500 mt-1">
            {site.policyUpdatedAt ? `Cập nhật lần cuối: ${site.policyUpdatedAt}.` : ''} Khi tạo tài khoản và thanh toán,
            bạn được xem là đã đọc và đồng ý với các điều khoản dưới đây.
          </p>
        </div>

        {/* Màn hình hẹp: mục lục nằm trên nội dung, không dính theo cuộn */}
        <Card className="p-4 mb-6 lg:hidden">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">Nội dung</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {SECTIONS.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-sm text-gray-400 hover:text-brand-500 transition-colors"
              >
                {index + 1}. {section.label}
              </a>
            ))}
          </div>
        </Card>

        <div className="flex gap-8 items-start">
          {/* Màn hình rộng: mục lục là cột trái dính theo cuộn.
              top-20 = chiều cao thanh trên (3.5rem) cộng một khoảng thở. */}
          <aside className="hidden lg:block w-56 shrink-0 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto custom-scrollbar">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-3">Nội dung</p>
            <nav className="space-y-0.5">
              {SECTIONS.map((section, index) => {
                const isActive = activeId === section.id;
                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={`block text-sm px-3 py-1.5 rounded-lg border-l-2 transition-colors ${
                      isActive
                        ? 'border-brand-500 bg-brand-500/10 text-gray-100 font-semibold'
                        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-dark-850'
                    }`}
                  >
                    <span className={isActive ? 'text-brand-500' : 'text-gray-600'}>{index + 1}.</span>{' '}
                    {section.label}
                  </a>
                );
              })}
            </nav>
          </aside>

          <div className="flex-1 min-w-0 space-y-8">
            <Card className="p-6 space-y-7">
          <Section id="dich-vu" title="1. Về dịch vụ">
            <p>
              Design Copycat AI là dịch vụ tạo ảnh marketing bằng trí tuệ nhân tạo. Bạn tải lên ảnh mẫu và ảnh sản
              phẩm, hệ thống gửi tới nhà cung cấp mô hình AI bên thứ ba để tạo ra ảnh mới theo bố cục của ảnh mẫu.
            </p>
            <p>
              Chất lượng ảnh phụ thuộc vào mô hình AI của bên thứ ba. Chúng tôi không cam kết ảnh tạo ra sẽ đúng hoàn
              toàn với mong muốn của bạn ở mọi lần tạo.
            </p>
          </Section>

          <Section id="tai-khoan" title="2. Tài khoản">
            <p>Mỗi địa chỉ email chỉ đăng ký được một tài khoản. Bạn chịu trách nhiệm bảo mật mật khẩu của mình.</p>
            <p>
              Chúng tôi có quyền tạm khoá tài khoản nếu phát hiện hành vi vi phạm mục 8, hoặc có dấu hiệu gian lận
              thanh toán.
            </p>
          </Section>

          <Section id="goi-cuoc" title="3. Gói dịch vụ & hạn mức điểm">
            <p>
              Bạn cần mua gói dịch vụ theo tháng trước khi sử dụng chức năng tạo ảnh. Các chu kỳ hiện có:{' '}
              <strong className="text-gray-300">{cycles} tháng</strong>. Chu kỳ dài hơn có đơn giá mỗi tháng thấp hơn.
            </p>
            <p>
              Mỗi tháng trong thời hạn gói, tài khoản được cấp hạn mức{' '}
              <strong className="text-gray-300">Tương ứng với gói đăng ký</strong> để tạo ảnh. Số điểm tiêu hao
              cho mỗi ảnh phụ thuộc mô hình và độ phân giải bạn chọn
              {cheapest && ` (thấp nhất là ${formatNumber(cheapest.tokenCost)} điểm/ảnh với ${cheapest.label})`}.
            </p>
            <p className="text-gray-300">
              <strong>Hạn mức tháng không được cộng dồn.</strong> Phần hạn mức chưa dùng hết trong một chu kỳ tháng sẽ
              bị xoá khi sang chu kỳ tháng tiếp theo. Mua gói chu kỳ dài không làm tăng hạn mức của từng tháng.
            </p>
            <p>
              Gia hạn khi gói cũ còn hiệu lực sẽ được cộng nối tiếp vào ngày hết hạn cũ, bạn không mất những ngày còn
              lại.
            </p>
            <p>
              Khi gói hết hạn, hạn mức tháng chưa dùng sẽ bị thu hồi và bạn không tạo ảnh được cho tới khi gia hạn.
            </p>
          </Section>

          <Section id="diem-le" title="4. Điểm mua thêm">
            <p>
              Khi đã dùng hết hạn mức của tháng, bạn có thể mua thêm điểm lẻ.
              {packages.length > 0 && (
                <>
                  {' '}
                  Hiện có {packages.length} gói, từ{' '}
                  {formatVnd(Math.min(...packages.map((pkg) => pkg.priceVnd)))} đến{' '}
                  {formatVnd(Math.max(...packages.map((pkg) => pkg.priceVnd)))}.
                </>
              )}
            </p>
            <p>
              Điểm mua thêm <strong className="text-gray-300">không hết hạn theo chu kỳ tháng</strong> và được giữ lại
              kể cả khi gói dịch vụ hết hạn.
            </p>
            <p>
              Khi tạo ảnh, hệ thống trừ hạn mức tháng trước, hết mới dùng tới điểm đã mua thêm — để phần sắp hết hạn
              được tiêu trước.
            </p>
            <p>Việc mua điểm lẻ yêu cầu tài khoản đang có gói dịch vụ còn hiệu lực.</p>
          </Section>

          <Section id="thanh-toan" title="5. Thanh toán">
            <p>
              Thanh toán bằng chuyển khoản ngân hàng. Mỗi đơn hàng có một mã riêng, bạn{' '}
              <strong className="text-gray-300">bắt buộc ghi đúng mã này vào nội dung chuyển khoản</strong> để hệ thống
              nhận diện tự động.
            </p>
            <p>
              Đơn hàng giữ chỗ trong {site.orderExpireMinutes} phút. Nếu bạn chuyển khoản muộn hơn, đơn vẫn được xử lý
              bình thường khi tiền về tài khoản.
            </p>
            <p>
              Chuyển khoản sai nội dung hoặc thiếu số tiền sẽ không được cộng tự động; những trường hợp này cần quản
              trị viên đối chiếu và duyệt thủ công, có thể mất thêm thời gian.
            </p>
            <p>Giá niêm yết là giá cuối cùng. Phí chuyển khoản (nếu có) do ngân hàng của bạn thu.</p>
          </Section>

          <Section id="hoan-tra" title="6. Hoàn điểm & hoàn tiền">
            <p>
              <strong className="text-gray-300">Ảnh tạo thất bại được hoàn điểm tự động</strong>, trả về đúng nguồn đã
              trừ. Bạn không bị mất điểm vì lỗi hệ thống hay lỗi từ nhà cung cấp AI.
            </p>
            <p>
              Ảnh đã tạo thành công nhưng không đúng ý muốn thì không được hoàn điểm, vì chi phí gọi mô hình AI đã
              phát sinh thực tế.
            </p>
            <p>
              Gói dịch vụ và điểm đã mua không quy đổi thành tiền mặt và không hoàn lại sau khi đã kích hoạt. Trường
              hợp bị trừ tiền mà không nhận được gói hoặc điểm, vui lòng liên hệ theo mục 12 để được đối soát và xử lý.
            </p>
          </Section>

          <Section id="noi-dung" title="7. Nội dung & bản quyền">
            <p>
              Bạn phải có đầy đủ quyền đối với ảnh mình tải lên. Bạn chịu trách nhiệm nếu ảnh tải lên xâm phạm quyền
              của bên thứ ba.
            </p>
            <p>
              Ảnh do hệ thống tạo ra thuộc về bạn và bạn được toàn quyền sử dụng cho mục đích thương mại, trong phạm vi
              điều khoản của nhà cung cấp mô hình AI cho phép.
            </p>
            <p>
              Chúng tôi lưu ảnh đầu vào và ảnh kết quả trên máy chủ để phục vụ chức năng lịch sử và tải lại; chúng tôi
              không bán hay chia sẻ ảnh của bạn cho bên thứ ba ngoài nhà cung cấp AI phục vụ chính việc tạo ảnh.
            </p>
          </Section>

          <Section id="cam" title="8. Hành vi bị cấm">
            <p>Không sử dụng dịch vụ để tạo hoặc phát tán:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nội dung vi phạm pháp luật Việt Nam;</li>
              <li>Nội dung xâm phạm bản quyền, nhãn hiệu hoặc hình ảnh cá nhân của người khác;</li>
              <li>Nội dung khiêu dâm, bạo lực, thù ghét hoặc gây hiểu nhầm nghiêm trọng;</li>
              <li>Nội dung mạo danh tổ chức, cá nhân có thật;</li>
              <li>Nội dung nhằm lừa đảo hoặc giả mạo giấy tờ, hoá đơn, chứng từ.</li>
            </ul>
            <p>Ngoài ra bạn cũng phải tuân thủ điều khoản của nhà cung cấp mô hình AI mà hệ thống sử dụng.</p>
            <p>Tài khoản vi phạm sẽ bị khoá và không được hoàn lại điểm hay tiền đã thanh toán.</p>
          </Section>

          <Section id="du-lieu" title="9. Dữ liệu & bảo mật">
            <p>
              Chúng tôi lưu: thông tin tài khoản (email, tên, số điện thoại), lịch sử đơn hàng, sổ ghi biến động điểm,
              ảnh đầu vào và ảnh kết quả.
            </p>
            <p>Mật khẩu được lưu ở dạng đã băm, chúng tôi không đọc được mật khẩu của bạn.</p>
            <p>
              Ảnh của bạn được gửi tới nhà cung cấp mô hình AI để xử lý. Việc nhà cung cấp đó lưu trữ và sử dụng dữ
              liệu tuân theo chính sách riêng của họ.
            </p>
            <p>Bạn có thể yêu cầu xoá tài khoản và dữ liệu liên quan bằng cách liên hệ theo mục 12.</p>
          </Section>

          <Section id="trach-nhiem" title="10. Giới hạn trách nhiệm">
            <p>
              Dịch vụ phụ thuộc vào hạ tầng và mô hình AI của bên thứ ba, nên có thể gián đoạn do bảo trì, sự cố kỹ
              thuật hoặc thay đổi từ phía nhà cung cấp.
            </p>
            <p>
              Chúng tôi không chịu trách nhiệm với thiệt hại gián tiếp phát sinh từ việc sử dụng ảnh do hệ thống tạo
              ra. Trách nhiệm tối đa trong mọi trường hợp không vượt quá số tiền bạn đã thanh toán cho chu kỳ dịch vụ
              đang sử dụng.
            </p>
          </Section>

          <Section id="thay-doi" title="11. Thay đổi điều khoản">
            <p>
              Chúng tôi có thể điều chỉnh giá gói, số điểm tiêu hao mỗi ảnh, danh sách mô hình và các điều khoản này
              khi chi phí từ nhà cung cấp thay đổi.
            </p>
            <p>
              Thay đổi <strong className="text-gray-300">không áp dụng ngược</strong> cho chu kỳ bạn đã thanh toán:
              gói đang có hiệu lực vẫn giữ nguyên hạn mức đã cam kết cho tới hết hạn.
            </p>
          </Section>

          <Section id="lien-he" title="12. Liên hệ">
            {site.companyName && (
              <p>
                Đơn vị cung cấp dịch vụ: <strong className="text-gray-300">{site.companyName}</strong>
              </p>
            )}
            {site.companyAddress && <p>Địa chỉ: {site.companyAddress}</p>}
            {site.supportEmail && (
              <p>
                Email hỗ trợ:{' '}
                <a href={`mailto:${site.supportEmail}`} className="text-brand-500 hover:underline">
                  {site.supportEmail}
                </a>
              </p>
            )}
            {site.supportPhone && (
              <p>
                Điện thoại:{' '}
                <a href={`tel:${site.supportPhone.replace(/\s/g, '')}`} className="text-brand-500 hover:underline">
                  {site.supportPhone}
                </a>
              </p>
            )}
            {missingContact && <p className="text-gray-500">Thông tin liên hệ đang được cập nhật.</p>}
              </Section>
            </Card>

            <p className="text-[11px] text-gray-600 text-center pb-4">
              Các con số về hạn mức, chu kỳ và giá trong trang này được lấy trực tiếp từ bảng giá đang áp dụng.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
