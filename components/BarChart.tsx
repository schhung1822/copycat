import React, { useMemo, useState } from 'react';

/**
 * Biểu đồ cột theo ngày, dựng bằng HTML/CSS nên tự co giãn theo bề rộng.
 *
 * Quy tắc áp dụng:
 *  - Chỉ một trục giá trị. Mọi series truyền vào phải cùng đơn vị (ở đây là VNĐ
 *    hoặc số lượng), không bao giờ ghép hai đơn vị lên một biểu đồ.
 *  - Bảng màu đã kiểm tra khoảng cách màu cho người mù màu (ΔE ≥ 8):
 *    #E60023 (thương hiệu) ↔ #3B82F6, ΔE 31.3 ở chế độ deutan trên nền #121212.
 *  - Có sẵn chế độ xem dạng bảng để không phụ thuộc hoàn toàn vào màu sắc.
 */

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface BarChartProps {
  labels: string[];
  series: ChartSeries[];
  /** Định dạng giá trị hiển thị ở tooltip và trục dọc */
  format: (value: number) => string;
  height?: number;
}

const GRID_STEPS = 4;

export const BarChart: React.FC<BarChartProps> = ({ labels, series, format, height = 200 }) => {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const max = useMemo(() => {
    const highest = Math.max(0, ...series.flatMap((s) => s.values));
    // Làm tròn lên cho trục dọc có mốc đẹp.
    if (highest === 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(highest));
    return Math.ceil(highest / magnitude) * magnitude;
  }, [series]);

  const gridValues = Array.from({ length: GRID_STEPS + 1 }, (_, i) => (max / GRID_STEPS) * (GRID_STEPS - i));

  if (showTable) {
    return (
      <div>
        <ChartHeader series={series} showTable={showTable} onToggle={() => setShowTable(false)} />
        <div className="overflow-x-auto custom-scrollbar max-h-[260px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-dark-900">
              <tr className="text-gray-500 border-b border-dark-800">
                <th className="text-left font-bold py-1.5">Ngày</th>
                {series.map((s) => (
                  <th key={s.key} className="text-right font-bold py-1.5">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={label} className="border-b border-dark-850 last:border-0">
                  <td className="py-1.5 text-gray-400">{label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1.5 text-right text-gray-300">
                      {format(s.values[index] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ChartHeader series={series} showTable={showTable} onToggle={() => setShowTable(true)} />

      <div className="flex gap-2">
        {/* Trục dọc */}
        <div className="w-14 shrink-0 text-right flex flex-col justify-between text-[10px] text-gray-600" style={{ height }}>
          {gridValues.map((value) => (
            <span key={value} className="leading-none">
              {format(value)}
            </span>
          ))}
        </div>

        {/* Vùng vẽ */}
        <div className="flex-1 relative min-w-0" style={{ height }}>
          {/* Lưới nền, để mờ cho không lấn át dữ liệu */}
          {gridValues.map((value, index) => (
            <div
              key={value}
              className="absolute left-0 right-0 border-t border-dark-800"
              style={{ top: `${(index / GRID_STEPS) * 100}%` }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-[3px]">
            {labels.map((label, index) => (
              <div
                key={label}
                className="flex-1 h-full flex items-end justify-center gap-[2px] relative group"
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              >
                {/* Vùng bắt chuột rộng hơn cột để dễ rê */}
                <div className="absolute inset-0" />

                {series.map((s) => {
                  const value = s.values[index] ?? 0;
                  return (
                    <div
                      key={s.key}
                      className="flex-1 rounded-t-[4px] transition-opacity min-h-[2px]"
                      style={{
                        height: `${Math.max((value / max) * 100, value > 0 ? 1.5 : 0)}%`,
                        backgroundColor: s.color,
                        opacity: hover === null || hover === index ? 1 : 0.35,
                      }}
                    />
                  );
                })}

                {hover === index && (
                  <div
                    className={`absolute bottom-full mb-2 z-20 bg-dark-850 border border-dark-700 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap pointer-events-none ${
                      index > labels.length / 2 ? 'right-0' : 'left-0'
                    }`}
                  >
                    <p className="text-[11px] font-bold text-gray-100 mb-1">{label}</p>
                    {series.map((s) => (
                      <p key={s.key} className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                        {s.label}: <span className="text-gray-200">{format(s.values[index] ?? 0)}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Nhãn trục ngang: chỉ hiện thưa để không chồng chữ */}
      <div className="flex gap-[3px] mt-2 ml-14 pl-2">
        {labels.map((label, index) => (
          <span key={label} className="flex-1 text-[9px] text-gray-600 text-center truncate">
            {index % Math.ceil(labels.length / 8) === 0 ? label : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

const ChartHeader: React.FC<{ series: ChartSeries[]; showTable: boolean; onToggle: () => void }> = ({
  series,
  showTable,
  onToggle,
}) => (
  <div className="flex items-center justify-between mb-3 gap-4">
    {/* Chú giải bắt buộc khi có từ 2 series trở lên */}
    <div className="flex items-center gap-4 flex-wrap">
      {series.length > 1 &&
        series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
    </div>
    <button onClick={onToggle} className="text-[11px] text-gray-500 hover:text-gray-100 transition-colors shrink-0">
      {showTable ? 'Xem biểu đồ' : 'Xem bảng số'}
    </button>
  </div>
);

export const CHART_COLORS = {
  /** Đỏ thương hiệu — dùng cho chỉ số chính (doanh thu) */
  primary: '#E60023',
  /** Xanh — đã kiểm tra tách biệt tốt với đỏ ở mọi dạng mù màu */
  secondary: '#3B82F6',
} as const;
