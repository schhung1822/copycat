# Design Copycat AI

Nền tảng tạo ảnh marketing bằng AI theo mô hình **trả trước bằng token**: khách đăng ký tài
khoản → nạp tiền qua chuyển khoản → nhận token → dùng token để tạo ảnh.

Trước đây ứng dụng chỉ có phần web gọi thẳng API Kie.ai bằng key nhúng sẵn trong mã nguồn.
Bản này bổ sung backend, cơ sở dữ liệu và toàn bộ luồng kinh doanh; API key của nhà cung cấp
nằm trên server, trình duyệt không còn nhìn thấy.

---

## 1. Chạy dự án

### Yêu cầu
- Node.js 20 trở lên
- MySQL 8 hoặc MariaDB 10.4 trở lên đang chạy

### Các bước

```bash
npm install

# Tạo file cấu hình rồi mở ra điền thông tin thật
cp .env.example .env

npm run dev
```

`npm run dev` chạy song song hai tiến trình:
- **web** — Vite tại http://localhost:3000 (mở trang này)
- **api** — Express tại http://localhost:4000

Vite chuyển tiếp `/api` và `/files` sang Express nên trình duyệt coi hai bên cùng một origin,
cookie đăng nhập hoạt động bình thường.

### Những mục **bắt buộc** điền trong `.env`

| Biến | Ý nghĩa |
|---|---|
| `DB_HOST` `DB_USER` `DB_PASSWORD` `DB_NAME` | Kết nối MySQL. Server tự tạo database và bảng khi khởi động. |
| `JWT_SECRET` | Chuỗi ngẫu nhiên dài. Sinh bằng `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_EMAILS` | Email được quyền admin, cách nhau bằng dấu phẩy |
| `KIE_API_KEY` | API key Kie.ai của bạn |
| `BANK_CODE` `BANK_ACCOUNT_NUMBER` `BANK_ACCOUNT_NAME` | Tài khoản nhận tiền, dùng để sinh mã QR VietQR |
| `SEPAY_WEBHOOK_API_KEY` *hoặc* `CASSO_WEBHOOK_SECURE_TOKEN` | Để cộng token tự động khi ngân hàng báo có |

Chưa cấu hình webhook thì hệ thống vẫn chạy được — đơn nạp sẽ chờ admin duyệt tay trong bảng
điều khiển. Server in cảnh báo cho từng mục còn thiếu khi khởi động.

### Chạy thật (một tiến trình duy nhất)

```bash
npm run build   # build web ra thư mục dist/
npm start       # Express phục vụ cả API lẫn web tĩnh tại cổng PORT
```

---

## 1b. Deploy lên VPS

### Thứ tự bắt buộc

```bash
git clone https://github.com/schhung1822/copycat.git
cd copycat

cp .env.example .env && nano .env      # điền DB, JWT_SECRET, ADMIN_EMAILS, KIE_API_KEY...

npm install                            # KHÔNG dùng --omit=dev ở bước này (cần vite để build)
npm run build                          # BẮT BUỘC — thiếu bước này web sẽ không hiện

npm i -g pm2
pm2 start npm --name copycat -- start
pm2 save && pm2 startup                # để tự chạy lại sau khi VPS khởi động lại
```

Chạy `npm start` trực tiếp trong SSH thì tiến trình sẽ **chết ngay khi bạn đóng terminal** —
đây là nguyên nhân 502 phổ biến nhất. Luôn dùng pm2 (hoặc systemd).

### Cấu hình nginx

Cổng trong `proxy_pass` phải **trùng với `PORT` trong `.env`** (mặc định 4000):

```nginx
server {
    listen 80;
    server_name tenmien-cua-ban.com;

    client_max_body_size 50M;          # ảnh gửi lên dạng base64, mặc định 1M của nginx là không đủ

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 300s;       # tạo ảnh 4K có thể mất vài phút
    }
}
```

Sau đó bật HTTPS: `sudo certbot --nginx -d tenmien-cua-ban.com`.

Khi đã có HTTPS thì đặt trong `.env`:

```env
NODE_ENV=production
APP_URL=https://tenmien-cua-ban.com
HOST=127.0.0.1
```

> `NODE_ENV=production` bật cờ `secure` cho cookie đăng nhập, nghĩa là cookie **chỉ hoạt động
> qua HTTPS**. Nếu site còn chạy HTTP thuần, cứ để `NODE_ENV=development` cho tới khi cài xong
> SSL. (Ứng dụng có sẵn cơ chế dự phòng bằng header `Authorization` nên vẫn đăng nhập được,
> nhưng cứ cấu hình đúng thì hơn.)

### Gặp lỗi 502 Bad Gateway — kiểm tra theo thứ tự

502 luôn có nghĩa là **nginx chạy bình thường nhưng không gọi được vào tiến trình Node**.
Nginx không phải thủ phạm, hãy soi tiến trình Node trước:

```bash
# 1. Node còn sống không?
pm2 list
pm2 logs copycat --lines 50        # ĐÂY LÀ CHỖ QUAN TRỌNG NHẤT — lỗi thật nằm ở đây

# 2. Có thật sự đang nghe ở cổng đó không?
ss -tlnp | grep node

# 3. Gọi thẳng vào Node, bỏ qua nginx
curl -i http://127.0.0.1:4000/api/health
```

| Kết quả bước 3 | Nghĩa là | Cách xử lý |
|---|---|---|
| `{"ok":true,...}` | Node ổn, lỗi nằm ở nginx | Sửa cổng trong `proxy_pass` cho khớp `PORT`; `nginx -t && systemctl reload nginx` |
| `Connection refused` | Node không chạy hoặc sai cổng | Xem `pm2 logs`, đối chiếu `PORT` trong `.env` |
| Treo, không trả lời | Node bị chặn bởi tường lửa nội bộ | Trên CentOS/RHEL: `setsebool -P httpd_can_network_connect 1` |

Các nguyên nhân hay gặp nhất, theo thứ tự:

1. **Tiến trình đã chết** — chạy `npm start` trong SSH rồi đóng terminal. Dùng pm2.
2. **Không kết nối được MySQL** — sai `DB_PASSWORD`, hoặc MySQL chưa chạy. Server sẽ thoát ngay
   khi khởi động và in rõ lý do trong `pm2 logs`.
3. **Cổng lệch nhau** — nginx trỏ vào 3000 nhưng `PORT=4000` (hoặc ngược lại).
4. **Thiếu `.env`** — server dùng giá trị mặc định, không nối được DB rồi thoát.
5. **Cài thiếu package** — nếu đã lỡ chạy `npm install --omit=dev`, chạy lại `npm install`.

Toàn bộ lỗi khởi động đều được in bằng tiếng Việt kèm hướng khắc phục, nên `pm2 logs copycat`
gần như luôn chỉ thẳng ra vấn đề.

---

## 2. Tài khoản admin

Quyền admin **chỉ điều khiển bằng `.env`**, không sửa được từ giao diện:

```env
ADMIN_EMAILS=admin@nextgenholdings.nl,sep@congty.com
```

Mỗi lần khởi động, server đồng bộ lại cột `role`: email có trong danh sách được nâng lên
admin, email bị gỡ khỏi danh sách bị hạ xuống user. Mọi request cũng kiểm tra lại theo `.env`
nên dữ liệu trong DB có bị sửa tay cũng không leo thang quyền được.

Muốn tạo sẵn tài khoản admin ngay lần chạy đầu, điền thêm:

```env
ADMIN_BOOTSTRAP_EMAIL=admin@nextgenholdings.nl
ADMIN_BOOTSTRAP_PASSWORD=mat-khau-manh
```

Admin vào mục **Quản trị** trên thanh điều hướng, gồm 5 tab:

| Tab | Nội dung |
|---|---|
| Tổng quan | Doanh thu, chi phí vốn, lợi nhuận gộp, số khách, tỉ lệ ảnh thành công, biểu đồ theo ngày, hiệu quả từng model, top khách hàng |
| Đơn nạp | Lọc theo trạng thái, tìm theo mã đơn/email, duyệt tay, huỷ đơn |
| Khách hàng | Tìm kiếm, khoá/mở tài khoản, cộng–trừ token thủ công kèm lý do |
| Bảng giá & gói nạp | Sửa trực tiếp giá vốn, số token thu, slug model, giá gói, token thưởng |
| Webhook ngân hàng | Nhật ký mọi giao dịch cổng thanh toán gửi về, dùng để tra khi khách báo chưa nhận token |

---

## 3. Luồng hoạt động

```
Đăng ký / Đăng nhập
        │
        ▼
Chọn gói nạp ──► Tạo đơn (mã NAPxxxxxx) ──► Hiện QR VietQR + thông tin CK
        │                                            │
        │                          khách chuyển khoản│
        │                                            ▼
        │                              Ngân hàng ──► Webhook SePay/Casso
        │                                            │
        │                            khớp mã đơn ────┤
        │                                            ▼
        └──────────────────────────────► Cộng token vào ví (ghi sổ cái)
                                                     │
                                                     ▼
                          Tạo ảnh ──► Trừ token ──► Gọi API nhà cung cấp
                                                     │
                                        ┌────────────┴────────────┐
                                     thành công                 lỗi
                                        │                         │
                          Tải ảnh về server              Hoàn token tự động
```

### Điểm quan trọng về tiền và token

- **Mọi biến động token đều được ghi vào bảng `token_transactions`** kèm số dư sau giao dịch.
  Không có đường nào sửa `users.token_balance` mà không ghi sổ.
- **Trừ token và cộng token chạy trong transaction có khoá dòng** (`SELECT ... FOR UPDATE`),
  nên hai request tạo ảnh song song không thể cùng đọc một số dư cũ rồi trừ đè lên nhau.
- **Ảnh lỗi được hoàn token tự động.** Server khởi động lại giữa chừng cũng hoàn token cho các
  ảnh đang dở dang, khách không bị treo tiền.
- **Webhook chống cộng trùng** bằng khoá duy nhất `(provider, external_id)` trong bảng
  `payment_events`, cộng với việc chỉ đơn ở trạng thái `pending` mới được cộng token. Cổng
  thanh toán bắn lại giao dịch hay admin bấm duyệt hai lần đều không cộng token hai lần.
- **Chuyển khoản thiếu tiền không được cộng tự động** — đơn giữ nguyên `pending` để admin xử lý.

---

## 4. Cơ sở dữ liệu

Toàn bộ định nghĩa nằm trong [server/src/schema.sql](server/src/schema.sql), chạy tự động khi
khởi động (`DB_AUTO_MIGRATE=true`).

| Bảng | Vai trò |
|---|---|
| `users` | Khách hàng, số dư token, số liệu tích luỹ |
| `token_packages` | Các gói nạp tiền |
| `model_pricing` | Bảng giá từng model: giá vốn USD ↔ số token thu của khách |
| `orders` | Đơn nạp tiền, có snapshot thông tin gói tại thời điểm đặt |
| `token_transactions` | Sổ cái token — nguồn sự thật cho mọi biến động số dư |
| `generations` | Từng lệnh tạo ảnh, kèm chi phí vốn và ảnh đầu vào/kết quả |
| `payment_events` | Nhật ký webhook ngân hàng, chống xử lý trùng |
| `settings` | Cấu hình sửa nóng không cần restart |

Số tiền lưu dạng số nguyên VNĐ (`BIGINT`), không có phần thập phân.

---

## 5. Bảng giá đã cấu hình sẵn

### Token tiêu hao mỗi ảnh

| Model | Slug gửi API | Giá vốn (Kie.ai) | Token thu | Giá bán danh nghĩa |
|---|---|---|---|---|
| GPT Image 2 — 1K | `gpt-image-2-image-to-image` | $0.03 | 30 | 3.000đ |
| GPT Image 2 — 2K | `gpt-image-2-image-to-image` | $0.05 | 45 | 4.500đ |
| GPT Image 2 — 4K | `gpt-image-2-image-to-image` | $0.08 | 70 | 7.000đ |
| Nano Banana 2 — 1K | `nano-banana-2` | $0.04 | 40 | 4.000đ |
| Nano Banana 2 — 2K | `nano-banana-2` | $0.06 | 55 | 5.500đ |
| Nano Banana 2 — 4K | `nano-banana-2` | $0.09 | 80 | 8.000đ |
| Nano Banana Pro — 1K/2K | `nano-banana-pro` | $0.09 | 80 | 8.000đ |
| Nano Banana Pro — 4K | `nano-banana-pro` | $0.12 | 105 | 10.500đ |
| Nano Banana 2 Lite | `nano-banana-2-lite` | *chưa rõ* | — | **đang tắt bán** |

**Nano Banana 2 Lite** đã được nối sẵn nhưng để trạng thái tắt: Kie.ai không công bố
giá bản Lite trong tài liệu công khai. Vào Quản trị → Bảng giá điền `Giá vốn (USD)` và
`Token thu` theo bảng giá thật rồi tick ô **Bán** để mở bán. Model này không có tuỳ chọn
2K/4K nên giao diện tự ẩn phần chọn chất lượng.

### Mỗi model có bộ tham số riêng

Đây là chỗ dễ sai nhất khi thêm model mới — Kie.ai **không** dùng chung một tên trường
cho ảnh đầu vào:

| Model | Trường ảnh | `resolution` | `output_format` | Tối đa ảnh |
|---|---|---|---|---|
| `nano-banana-pro` | `image_input` | có | có | 8 |
| `nano-banana-2` | `image_input` | có | có | 14 |
| `nano-banana-2-lite` | `image_urls` | **không** | **không** | 10 |
| `google/nano-banana-edit` | `image_urls` | **không** | có | 10 |
| `gpt-image-2-image-to-image` | `input_urls` | có | **không** | 16 |

Đặc tả nằm trong `MODEL_SPECS` ở [providers/kie.ts](server/src/providers/kie.ts), lấy từ
https://docs.kie.ai/llms.txt. Thêm model Kie.ai mới thì thêm một dòng ở đó theo đúng trang
tài liệu của model, rồi thêm dòng giá trong trang Quản trị.

GPT Image 2 còn có ràng buộc riêng giữa tỉ lệ và chất lượng (5:4 và 4:5 chỉ chạy 1K; 1:1
không lên được 4K; tỉ lệ "Tự động" chỉ ra 1K). Hệ thống kiểm tra các ràng buộc này **trước
khi trừ token** và báo lỗi cụ thể, thay vì trừ rồi hoàn.

Các model Imagen 4 của Google không được đưa vào vì chúng chỉ sinh ảnh từ chữ, không nhận
ảnh sản phẩm nên không dùng được cho luồng sao chép bố cục của ứng dụng này.

### Gói nạp tiền

| Gói | Giá nạp | Token nhận | Giá thực tế/token | Thưởng |
|---|---|---|---|---|
| Trải nghiệm | 49.000đ | 490 | 100đ | 0% |
| Creator | 99.000đ | 1.020 | 97,1đ | 3% |
| Creator Plus | 199.000đ | 2.100 | 94,8đ | 5,5% |
| Studio | 499.000đ | 5.500 | 90,7đ | 10,2% |
| Agency | 999.000đ | 11.500 | 86,9đ | 15,1% |

Dữ liệu này chỉ được nạp **một lần** lúc khởi tạo (`INSERT IGNORE`). Sau đó sửa trong tab
**Bảng giá & gói nạp** của trang Quản trị; server không ghi đè lại.

Riêng slug model là ngoại lệ: khi khởi động, server tự sửa những slug đã biết chắc là sai
(xem `repairKnownBadModelSlugs` trong [seed.ts](server/src/seed.ts)). Slug nào bạn tự đặt
khác đi sẽ được giữ nguyên.

---

## 6. Cấu hình webhook nhận tiền tự động

### SePay
1. Vào SePay → Webhooks → thêm webhook mới.
2. URL: `https://tenmien-cua-ban.com/api/webhooks/sepay`
3. Kiểu xác thực: **API Key**, giá trị trùng với `SEPAY_WEBHOOK_API_KEY` trong `.env`.

### Casso (v2)
1. Vào Casso → Webhook → thêm endpoint.
2. URL: `https://tenmien-cua-ban.com/api/webhooks/casso`
3. Secure Token trùng với `CASSO_WEBHOOK_SECURE_TOKEN` trong `.env`.

Webhook phải truy cập được từ Internet. Khi chạy thử ở máy cá nhân, dùng ngrok hoặc Cloudflare
Tunnel để lấy một URL public.

**Cách hệ thống khớp giao dịch:** nội dung chuyển khoản được bỏ hết ký tự đặc biệt rồi dò mã
dạng `NAP` + 6 ký tự. Mọi ứng viên tìm được đều phải tồn tại thật trong bảng `orders` mới được
dùng — chữ dính liền mã không thể làm cộng nhầm cho đơn khác. Giao dịch không khớp được vẫn
lưu vào tab **Webhook ngân hàng** để admin duyệt tay.

---

## 7. Thêm nhà cung cấp AI mới

Kiến trúc đã tách sẵn cho việc này:

1. Tạo file mới trong [server/src/providers/](server/src/providers/), export một object thoả
   interface `ImageProvider` (xem [types.ts](server/src/providers/types.ts) và
   [kie.ts](server/src/providers/kie.ts) làm mẫu).
2. Đăng ký adapter trong [server/src/providers/index.ts](server/src/providers/index.ts).
3. Vào trang Quản trị → **Bảng giá** → thêm dòng mới với cột `provider` trùng tên adapter.

Không phải sửa route, không phải sửa giao diện — trang tạo ảnh tự đọc danh sách model từ database.

---

## 8. Cấu trúc thư mục

```
├── server/src/
│   ├── index.ts              khởi tạo Express, gắn route, phục vụ file tĩnh
│   ├── env.ts                đọc & kiểm tra .env
│   ├── db.ts                 pool MySQL, transaction, migrate
│   ├── schema.sql            định nghĩa toàn bộ bảng
│   ├── seed.ts               dữ liệu khởi tạo + đồng bộ quyền admin
│   ├── lib/                  auth (JWT, phân quyền), lỗi, kiểm tra dữ liệu vào
│   ├── providers/            adapter nhà cung cấp AI (kie.ts, …)
│   ├── services/             nghiệp vụ: token, đơn nạp, tạo ảnh, lưu trữ
│   └── routes/               auth, catalog, orders, wallet, generations, admin, webhooks
│
├── pages/                    các trang React
│   └── admin/                các tab của bảng điều khiển
├── components/               thành phần dùng chung (Layout, BarChart, ui, upload)
├── context/AuthContext.tsx   trạng thái đăng nhập
├── lib/                      gọi API, định dạng số/ngày
└── types.ts                  kiểu dữ liệu dùng chung
```

## 9. Lệnh có sẵn

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy web + API cùng lúc (có tự nạp lại khi sửa mã) |
| `npm run dev:web` | Chỉ chạy giao diện |
| `npm run dev:api` | Chỉ chạy API |
| `npm run build` | Build giao diện ra `dist/` |
| `npm start` | Chạy bản production (một tiến trình phục vụ cả API và web) |
| `npm run lint` | Kiểm tra kiểu TypeScript cho cả frontend và backend |
