/**
 * Các đường dẫn được nhắc tới ở nhiều nơi.
 *
 * Trang chủ "/" là trang giới thiệu công khai; bàn làm việc của khách nằm ở
 * `/tao-anh`. Hai thứ này từng là một, và khi tách ra thì có tới tám chỗ trong
 * mã nguồn đang trỏ "/" với nghĩa "vào tạo ảnh" — sót một chỗ là khách bấm nút
 * xong quay về đúng trang bán hàng vừa đứng. Khai báo ở đây để lần sau đổi
 * đường dẫn chỉ phải sửa một dòng.
 */

/** Trang giới thiệu, cũng là trang chủ. */
export const LANDING = '/';

/** Bàn làm việc: nơi khách đăng nhập xong được đưa tới. */
export const APP_HOME = '/tao-anh';
