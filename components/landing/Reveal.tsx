import React, { useEffect, useRef, useState } from 'react';

/**
 * Bọc một khối nội dung để nó hiện dần khi cuộn tới.
 *
 * Dùng IntersectionObserver thay vì bắt sự kiện scroll: trình duyệt tự tính,
 * không chạy JS mỗi khung hình nên cuộn vẫn mượt trên máy yếu.
 *
 * Quan sát xong thì NGẮT ngay — hiệu ứng chỉ chơi một lần. Cuộn lên rồi cuộn
 * xuống mà khối lại mờ đi rồi hiện lại là kiểu chuyển động gây mệt mắt.
 *
 * `rootMargin` âm ở đáy để khối chỉ chạy khi đã vào hẳn khung nhìn, tránh
 * trường hợp hiệu ứng chơi xong trước khi người dùng kịp nhìn thấy.
 *
 * Phần tắt hiệu ứng khi hệ điều hành bật "giảm chuyển động" nằm ở CSS
 * (`prefers-reduced-motion` trong index.html), nên ở đây không cần xử lý lại.
 */
export const Reveal: React.FC<{
  children: React.ReactNode;
  /** Trễ so với khối trước, tính bằng mili giây — dùng để xếp hiệu ứng so le. */
  delay?: number;
  anim?: 'up' | 'fade' | 'zoom';
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}> = ({ children, delay = 0, anim = 'up', className = '', as: Tag = 'div' }) => {
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsVisible(true);
        observer.disconnect();
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      data-anim={anim}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      className={`lp-reveal ${isVisible ? 'is-visible' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
};
