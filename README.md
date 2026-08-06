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

### ⚠️ Trên VPS đừng chạy `npm run dev`

`npm run dev` là chế độ phát triển: nó bật **hai** tiến trình (Vite ở cổng 3000 + API ở cổng
4000), tự nạp lại khi sửa mã, và chậm hơn nhiều. Trên máy chủ thật chỉ chạy `npm start` —
một tiến trình duy nhất ở cổng `PORT`, phục vụ cả API lẫn giao diện đã build.

Chạy `npm run dev` nhiều lần rồi đóng terminal sẽ để lại một đống tiến trình mồ côi giữ cổng.
Khi đó Vite tự nhảy sang 3001, 3002... còn API thì báo "Cổng 4000 đang bị chiếm", và nginx
vẫn trỏ vào cổng cũ đang bị một tiến trình treo giữ → **502**.

### Dọn sạch tiến trình cũ rồi chạy lại

```bash
# 1. Xem đang có gì chiếm cổng
pm2 list
ss -tlnp | grep -E ':(3000|3001|3002|4000)'

# 2. Dọn hết
pm2 delete all
pkill -f "server/src/index.ts"
pkill -f "tsx watch"
pkill -f vite

# 3. Xác nhận đã sạch — lệnh này không in ra gì là đúng
ss -tlnp | grep -E ':(3000|4000)'

# 4. Chạy đúng chế độ production
npm install
npm run build
pm2 start npm --name copycat -- start
pm2 save

# 5. Kiểm tra
pm2 logs copycat --lines 30
curl -i http://127.0.0.1:4000/api/health
```

### Tạo ảnh báo "Authentication failed" / không kết nối được nhà cung cấp AI

Nghĩa là Kie.ai từ chối `KIE_API_KEY`. Kiểm tra chính cái key đó bằng lệnh sau, chạy ngay trong
thư mục dự án trên VPS (đọc thẳng từ `.env` nên không sợ chép nhầm):

```bash
cd /var/www/copycat
KEY=$(grep -E '^KIE_API_KEY=' .env | cut -d= -f2- | tr -d "\"'\r ")
echo "Độ dài key: ${#KEY}"

curl -s -X POST https://kieai.redpandaai.co/api/file-base64-upload \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"base64Data":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=","uploadPath":"images"}'
```

| Kết quả | Nghĩa là | Cách xử lý |
|---|---|---|
| `{"success":true,...}` kèm URL | Key tốt, lỗi nằm ở chỗ server chưa nạp lại `.env` | `pm2 restart copycat` rồi thử lại |
| `code: 401` | Key sai hoặc đã bị thu hồi | Vào kie.ai lấy key mới, dán lại vào `.env`, `pm2 restart copycat` |
| Độ dài key bằng 0 | Dòng `KIE_API_KEY=` trống hoặc sai tên biến | Kiểm tra lại `.env`, tên biến phải viết đúng, không có dấu cách trước dấu `=` |

Hay gặp nhất: dán key vào `nano` bị **xuống dòng giữa chừng** nên key bị cắt cụt — dòng
"Độ dài key" ở trên sẽ cho thấy ngay.

> **Đừng đổi `KIE_UPLOAD_URL` sang `api.kie.ai`.** Tài liệu Kie.ai ghi endpoint upload là
> `https://api.kie.ai/api/file-base64-upload`, nhưng địa chỉ đó trả về **404** (đã kiểm chứng).
> Endpoint upload thật nằm ở host riêng `kieai.redpandaai.co`, đúng như giá trị mặc định.

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

## 3. Mô hình kinh doanh

Khách **bắt buộc mua gói thuê bao theo tháng** trước khi dùng dịch vụ. Gói tháng đã bao gồm
chi phí duy trì, nhân sự và một hạn mức token dùng trong tháng. Dùng hết hạn mức thì mua thêm
gói token lẻ.

### Đơn vị token

> **1 token = 1đ giá vốn nhà cung cấp.**

Đây là điểm mấu chốt để mọi con số khớp nhau:

| Khái niệm | Cách tính | Kết quả |
|---|---|---|
| Hạn mức tháng | 500.000đ tiền token theo giá gốc | **500.000 token** |
| Token tiêu hao mỗi ảnh | `api_cost_usd × USD_TO_VND` | GPT 1K = 840 · Pro 4K = 3.360 |
| Gói token lẻ | khách chỉ nhận **một nửa** lượng token so với số tiền bỏ ra tính theo giá vốn | 499.000đ → **250.000 token** |

Khách trả 1.500.000đ/tháng nhưng chỉ được cấp 500.000đ tiền token theo giá vốn — phần chênh
lệch là chi phí duy trì, nhân sự và lợi nhuận.

### Hai nguồn token, tiêu theo thứ tự

| Nguồn | Nguồn gốc | Hết hạn |
|---|---|---|
| **Hạn mức tháng** | Kèm theo gói thuê bao, cấp lại đầu mỗi chu kỳ tháng | **Có** — không cộng dồn, sang tháng mới là mất |
| **Token mua thêm** | Khách bỏ tiền mua gói lẻ | Không |

Khi tạo ảnh, hệ thống **trừ hạn mức tháng trước**, cạn mới dùng tới token đã mua. Thứ tự này
có lợi cho khách: phần sắp hết hạn được tiêu trước, phần đã trả tiền được để dành.

### Luồng hoạt động

```
Đăng ký / Đăng nhập
        │
        ▼
Mua gói tháng (1 / 3 / 6 / 12 tháng) ──► Tạo đơn (mã NAPxxxxxx) ──► QR VietQR
        │                                              │
        │                            khách chuyển khoản│
        │                                              ▼
        │                                Ngân hàng ──► Webhook SePay/Casso
        │                                              │
        │                              khớp mã đơn ────┤
        │                                              ▼
        │                          Kích hoạt gói + cấp 500.000 token hạn mức
        │                                              │
        │      ┌───────────────────────────────────────┤
        │      ▼                                       ▼
        │  Hết hạn mức?                    Tạo ảnh ──► Trừ token
        │      │                                       │  (hạn mức tháng trước,
        │      ▼                                       │   token mua thêm sau)
        └─ Mua gói token lẻ ──► Cộng token             ▼
           (không hết hạn)              ┌──────────────┴──────────────┐
                                     thành công                     lỗi
                                        │                            │
                          Tải ảnh về server              Hoàn đúng nguồn đã trừ

        Đầu chu kỳ tháng mới ──► Xoá hạn mức thừa ──► Cấp lại 500.000 token
```

### Bảng giá gói thuê bao

| Chu kỳ | Giá niêm yết | Thực trả | Quy ra mỗi tháng | Chiết khấu |
|---|---|---|---|---|
| 1 tháng | 1.500.000đ | **1.500.000đ** | 1.500.000đ | — |
| 3 tháng | 4.500.000đ | **4.275.000đ** | 1.425.000đ | 5% |
| 6 tháng | 9.000.000đ | **8.100.000đ** | 1.350.000đ | 10% |
| 12 tháng | 18.000.000đ | **15.300.000đ** | 1.275.000đ | 15% |

Mua chu kỳ dài **không** cấp nhiều hạn mức hơn một lần: hạn mức vẫn là 500.000 token và vẫn
được cấp lại theo từng tháng. Chu kỳ dài chỉ rẻ hơn và khỏi phải gia hạn thường xuyên.

### Nâng lên gói cao hơn

Khách đang dùng gói có thể nâng lên gói **đắt hơn** và chỉ trả phần chênh lệch:

```
Số tiền phải bù = Giá gói mới − ( Giá gói cũ × số ngày còn lại ÷ tổng số ngày )
```

Ví dụ đang dùng gói 1 tháng (1.500.000đ), còn 30/31 ngày, nâng lên gói 1 năm:

| | |
|---|---|
| Giá gói 1 năm | 15.300.000đ |
| Trừ phần chưa dùng | −1.451.613đ |
| **Phải bù** | **13.848.387đ** |

Sau khi thanh toán thành công:

- Thời hạn gói mới **tính từ thời điểm nâng**, không cộng nối vào ngày hết hạn cũ.
- Hạn mức tháng được cấp lại ngay theo mức của gói mới. Hạn mức chưa dùng của gói cũ bị thu
  hồi (có ghi dòng `expire` trong sổ cái) vì phần đó đã được quy thành tiền khấu trừ vào đơn.
- Thuê bao lưu **giá niêm yết** của gói, không phải số tiền đã trả — nếu lưu số đã trả thì lần
  nâng sau khách sẽ bị tính khấu trừ trên một con số thấp hơn giá trị thật.

Chỉ nâng lên được gói có giá cao hơn. **Hạ gói không hỗ trợ** vì sẽ phát sinh nghĩa vụ hoàn
tiền mặt, nằm ngoài luồng thanh toán một chiều hiện tại.

> Lưu ý về vận hành: khấu trừ tính theo **ngày**, không theo token đã dùng. Khách tiêu hết
> hạn mức tháng rồi nâng gói ngay vẫn được khấu trừ gần như trọn vẹn và nhận thêm một hạn mức
> mới. Với gói 1 tháng, mức thiệt tối đa khoảng 500.000đ tiền token theo giá vốn. Nếu muốn
> chặn, sửa `computeUpgradeQuote` trong
> [subscriptionService.ts](server/src/services/subscriptionService.ts) để lấy tỉ lệ nhỏ hơn
> giữa "ngày còn lại" và "token còn lại".

### Bảng giá gói token lẻ

Số token của mỗi gói neo theo hạn mức tháng cho khách dễ hình dung, giá bán làm tròn xuống
mốc x99.000đ nên đơn giá luôn xấp xỉ 2đ/token (đúng quy tắc bán gấp đôi giá vốn).

| Gói | Token nhận | So với hạn mức tháng | Đơn giá |
|---|---|---|---|
| 99.000đ | 50.000 | 1/10 | 1,98đ/token |
| 199.000đ | 100.000 | 1/5 | 1,99đ/token |
| **499.000đ** | **250.000** | **1/2** | 2,00đ/token |
| 999.000đ | 500.000 | bằng đúng | 2,00đ/token |
| 1.999.000đ | 1.000.000 | gấp đôi | 2,00đ/token |

### Điểm quan trọng về tiền và token

- **Chưa có gói thuê bao thì không tạo ảnh được, cũng không mua token lẻ được.** Token lẻ là
  phần mua thêm cho khách đang dùng dịch vụ, không phải đường vòng để né gói tháng.
- **Hạn mức tháng được cấp lại ngay lúc khách dùng tới** (lazy), không cần cron. Nhờ vậy số
  liệu luôn đúng kể cả khi server vừa khởi động lại hay dừng vài ngày.
- **Gia hạn khi gói cũ còn hạn thì nối tiếp vào ngày hết hạn cũ**, khách không mất những ngày
  còn lại, và hạn mức đang dùng dở không bị reset.
- **Hết hạn thuê bao: hạn mức tháng bị thu hồi, token đã mua thêm vẫn còn nguyên** — đó là tiền
  thật khách đã bỏ ra.
- **Hoàn token khi ảnh lỗi trả về đúng nguồn đã trừ.** Phần hạn mức tháng bị chặn không cho
  vượt quá hạn mức của gói, nên ảnh lỗi sau khi đã sang chu kỳ mới không tạo ra token khống.

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
| `users` | Khách hàng, hạn mức tháng, token đã mua, ngày hết hạn thuê bao |
| `subscription_plans` | Bảng giá gói thuê bao 1 / 3 / 6 / 12 tháng |
| `subscriptions` | Lịch sử thuê bao đã mua, dùng để đối soát và gia hạn |
| `token_packages` | Các gói token lẻ mua thêm |
| `model_pricing` | Bảng giá từng model: giá vốn USD ↔ số token thu của khách |
| `orders` | Đơn nạp tiền, có snapshot thông tin gói tại thời điểm đặt |
| `token_transactions` | Sổ cái token — mỗi dòng ghi rõ tác động vào nguồn nào (`bucket`) |
| `generations` | Từng lệnh tạo ảnh, kèm chi phí vốn và token đã trừ từ mỗi nguồn |
| `payment_events` | Nhật ký webhook ngân hàng, chống xử lý trùng |
| `settings` | Cấu hình sửa nóng không cần restart |

Số tiền lưu dạng số nguyên VNĐ (`BIGINT`), không có phần thập phân.

---

## 5. Bảng giá đã cấu hình sẵn

### Token tiêu hao mỗi ảnh

`token_cost = api_cost_usd × USD_TO_VND` (1 token = 1đ giá vốn). Cột cuối tính trên hạn mức
500.000 token/tháng nếu chỉ dùng một loại ảnh duy nhất.

| Model | Slug gửi API | Giá vốn (Kie.ai) | Token/ảnh | Số ảnh trong hạn mức tháng |
|---|---|---|---|---|
| GPT Image 2 — 1K | `gpt-image-2-image-to-image` | $0.03 | 840 | ~595 |
| GPT Image 2 — 2K | `gpt-image-2-image-to-image` | $0.05 | 1.400 | ~357 |
| GPT Image 2 — 4K | `gpt-image-2-image-to-image` | $0.08 | 2.240 | ~223 |
| Nano Banana 2 — 1K | `nano-banana-2` | $0.04 | 1.120 | ~446 |
| Nano Banana 2 — 2K | `nano-banana-2` | $0.06 | 1.680 | ~297 |
| Nano Banana 2 — 4K | `nano-banana-2` | $0.09 | 2.520 | ~198 |
| Nano Banana Pro — 1K/2K | `nano-banana-pro` | $0.09 | 2.520 | ~198 |
| Nano Banana Pro — 4K | `nano-banana-pro` | $0.12 | 3.360 | ~148 |
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

Bảng giá gói thuê bao và gói token lẻ nằm ở [mục 3](#3-mô-hình-kinh-doanh).

Dữ liệu này chỉ được nạp **một lần** lúc khởi tạo (`INSERT IGNORE`). Sau đó sửa trong tab
**Bảng giá & gói nạp** của trang Quản trị; server không ghi đè lại.

> **Nâng cấp từ bản cũ:** phiên bản trước tính 1 token ≈ 100đ giá bán, bản này neo vào giá vốn
> nên các con số lệch nhau khoảng 28 lần. Khi khởi động, server tự quy đổi `token_cost` của
> những model còn giữ đúng giá trị mặc định cũ, và ngừng bán 5 gói token đời cũ (Trải nghiệm,
> Creator, Creator Plus, Studio, Agency) vì chúng sai đơn vị. Dòng nào bạn đã tự chỉnh trong
> trang Quản trị thì được giữ nguyên — kiểm tra lại sau khi nâng cấp.
>
> Số dư `token_balance` cũ của khách cũng đang ở đơn vị cũ và **không** được tự quy đổi (không
> có cách quy đổi nào đúng cho mọi trường hợp). Số dư cũ giờ mang giá trị rất nhỏ; nếu có khách
> thật đang giữ token, hãy dùng Quản trị → Khách hàng → **Sửa token** để cấp bù cho đúng.

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

### Dùng workflow riêng thay cho webhook có sẵn

Nếu bạn đã có hệ thống xử lý thanh toán riêng (n8n, Make, script...), **không cần** gọi API
nào cả. Chỉ cần đổi trạng thái đơn trong database:

```sql
UPDATE orders SET status = 'paid' WHERE code = 'NAPXXXXXX';
```

Server tự phát hiện trong vòng `ORDER_SYNC_INTERVAL_SECONDS` (mặc định 20 giây) rồi làm nốt
phần còn lại: kích hoạt gói thuê bao hoặc cộng token, ghi sổ cái, bù `paid_at`/`paid_source`
cho báo cáo doanh thu. Workflow của bạn **không cần biết gì** về nghiệp vụ token.

Cách này an toàn:

- Cột `fulfilled_at` đánh dấu đơn đã giao hàng. Đơn chỉ được xử lý khi `status='paid'` **và**
  `fulfilled_at IS NULL`, kiểm tra lại bên trong `SELECT ... FOR UPDATE`, nên chạy trùng hay
  chạy song song đều không cộng token hai lần.
- Đơn `cancelled` không bao giờ được giao hàng, dù có ai đó đổi nhầm.
- Đơn được đánh dấu lúc server đang tắt sẽ được xử lý ngay khi server khởi động lại.

> Đừng tự viết logic cộng token trong workflow. Toàn bộ nghiệp vụ (chu kỳ hạn mức tháng, sổ
> cái, gia hạn nối tiếp) chỉ tồn tại một bản duy nhất trong server; viết thêm bản thứ hai là
> nguồn gốc của sai lệch số liệu.

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
├── context/ThemeContext.tsx  chế độ sáng / tối
├── lib/                      gọi API, định dạng số/ngày
└── types.ts                  kiểu dữ liệu dùng chung
```

## 8b. Chế độ sáng / tối

Mặc định là **chế độ sáng** (nền ghi dịu). Nút chuyển nằm ở góc phải thanh điều hướng và ở
màn hình đăng nhập; lựa chọn được ghi nhớ trong `localStorage`.

Toàn bộ bảng màu nằm trong khối `<style>` của [index.html](index.html) dưới dạng biến CSS,
ghi theo bộ ba kênh RGB nên Tailwind vẫn dùng được cú pháp độ mờ (`bg-dark-900/50`). Tên biến:

| Nhóm | Vai trò |
|---|---|
| `--s-*` | Bề mặt: nền trang, thẻ, ô nhập, viền (`dark-950` → `dark-600`) |
| `--t-*` | Chữ: `100` rõ nhất → `700` mờ nhất (ánh xạ vào `gray-100`…`gray-700`) |
| `--st-*` | Màu trạng thái: đỏ / xanh lá / vàng / xanh dương / cam |

**Đổi màu chỉ cần sửa biến, không phải sửa class ở từng thành phần.** Đỏ thương hiệu
(`brand-500`) cố định ở cả hai chế độ vì luôn nằm trên nền đặc kèm chữ trắng.

Các cặp màu trạng thái ở chế độ sáng đã được tính độ tương phản WCAG trên nền thẻ và đều đạt
tối thiểu 4,5:1 (mức AA cho chữ nhỏ). Nếu bạn đổi giá trị trong `--st-*` thì phải tính lại.

## 9. Lệnh có sẵn

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy web + API cùng lúc (có tự nạp lại khi sửa mã) |
| `npm run dev:web` | Chỉ chạy giao diện |
| `npm run dev:api` | Chỉ chạy API |
| `npm run build` | Build giao diện ra `dist/` |
| `npm start` | Chạy bản production (một tiến trình phục vụ cả API và web) |
| `npm run lint` | Kiểm tra kiểu TypeScript cho cả frontend và backend |
