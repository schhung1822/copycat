import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { ImageUploadBox } from '../components/ImageUploadBox';
import { Alert, PageLoader, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatNumber, STATUS_LABEL } from '../lib/format';
import type { Catalog, Generation, ImageState, ModelOption } from '../types';

/**
 * `auto` để model tự chọn tỉ lệ hợp lý theo ảnh mẫu — đây là lựa chọn mặc định vì
 * giữ được bố cục gốc của ảnh mẫu tốt nhất. Không phải model nào cũng nhận hết
 * danh sách này; server sẽ báo lỗi rõ ràng trước khi trừ token nếu không hợp lệ.
 */
const ASPECT_RATIOS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Tự động (theo ảnh mẫu)' },
  { value: '1:1', label: '1:1 — Vuông' },
  { value: '3:4', label: '3:4 — Dọc' },
  { value: '4:3', label: '4:3 — Ngang' },
  { value: '4:5', label: '4:5 — Instagram' },
  { value: '5:4', label: '5:4' },
  { value: '9:16', label: '9:16 — Story / Reels' },
  { value: '16:9', label: '16:9 — Ngang rộng' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '21:9', label: '21:9 — Siêu rộng' },
];
const POLL_INTERVAL_MS = 3000;
const SETTINGS_KEY = 'copycat-studio-settings-v3';

interface StoredSettings {
  family?: string;
  resolution?: string;
  aspectRatio?: string;
  quantity?: number;
  prompt?: string;
}

const isPending = (generation: Generation) => generation.status === 'queued' || generation.status === 'processing';

export const StudioPage: React.FC = () => {
  const { user, setTokenBalance } = useAuth();

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [refImages, setRefImages] = useState<ImageState[]>([]);
  const [prodImages, setProdImages] = useState<ImageState[]>([]);
  const [prompt, setPrompt] = useState('');
  const [family, setFamily] = useState('');
  const [resolution, setResolution] = useState('');
  const [aspectRatio, setAspectRatio] = useState('auto');
  const [quantity, setQuantity] = useState(1);

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [redoTarget, setRedoTarget] = useState<Generation | null>(null);
  const [redoPrompt, setRedoPrompt] = useState('');

  // --- Tải bảng giá + lịch sử gần đây ---------------------------------------
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // Đọc lại số dư cùng lúc: đây là trang duy nhất chặn thao tác dựa trên
        // số token, nên không được phép dùng giá trị đã cũ trong bộ nhớ.
        const [catalogData, historyData, walletData] = await Promise.all([
          api.get<Catalog>('/catalog'),
          api.get<{ generations: Generation[] }>('/generations?limit=24'),
          api.get<{ tokenBalance: number }>('/wallet'),
        ]);
        if (cancelled) return;

        setCatalog(catalogData);
        setGenerations(historyData.generations);
        setTokenBalance(walletData.tokenBalance);

        const stored = readSettings();
        const families = [...new Set(catalogData.models.map((model) => model.family))];
        const nextFamily = stored.family && families.includes(stored.family) ? stored.family : families[0] ?? '';
        const resolutions = catalogData.models.filter((model) => model.family === nextFamily).map((m) => m.resolution);

        setFamily(nextFamily);
        setResolution(stored.resolution && resolutions.includes(stored.resolution) ? stored.resolution : resolutions[0] ?? '');
        if (stored.aspectRatio) setAspectRatio(stored.aspectRatio);
        if (stored.quantity) setQuantity(stored.quantity);
        if (stored.prompt) setPrompt(stored.prompt);
      } catch (err) {
        if (!cancelled) setCatalogError(err instanceof ApiError ? err.message : 'Không tải được bảng giá.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setTokenBalance]);

  // Ghi nhớ cấu hình để lần sau vào không phải chọn lại.
  useEffect(() => {
    if (!family) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ family, resolution, aspectRatio, quantity, prompt }));
      } catch {
        /* bỏ qua nếu trình duyệt chặn localStorage */
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [family, resolution, aspectRatio, quantity, prompt]);

  const families = useMemo(() => {
    if (!catalog) return [] as { key: string; label: string }[];
    const seen = new Map<string, string>();
    for (const model of catalog.models) {
      // "Nano Banana Pro — 1K" -> "Nano Banana Pro"
      if (!seen.has(model.family)) seen.set(model.family, model.label.split('—')[0].trim());
    }
    return [...seen].map(([key, label]) => ({ key, label }));
  }, [catalog]);

  const resolutionOptions = useMemo(
    () => (catalog?.models ?? []).filter((model) => model.family === family),
    [catalog, family],
  );

  const selectedModel: ModelOption | undefined = useMemo(
    () => resolutionOptions.find((model) => model.resolution === resolution),
    [resolutionOptions, resolution],
  );

  const jobCount = Math.max(refImages.length, 1) * quantity;
  const totalCost = (selectedModel?.tokenCost ?? 0) * jobCount;
  const balance = user?.tokenBalance ?? 0;
  const isSubscribed = user?.isSubscribed ?? false;
  const notEnoughTokens = totalCost > balance;

  // --- Hỏi trạng thái các ảnh đang xử lý ------------------------------------
  const pendingIds = useMemo(() => generations.filter(isPending).map((g) => g.id), [generations]);
  const pendingKey = pendingIds.join(',');
  const pendingKeyRef = useRef(pendingKey);
  pendingKeyRef.current = pendingKey;

  useEffect(() => {
    if (!pendingKey) return;

    const poll = async () => {
      try {
        const data = await api.get<{ generations: Generation[]; tokenBalance: number }>(
          `/generations/status?ids=${pendingKeyRef.current}`,
        );
        setGenerations((current) => {
          const updates = new Map(data.generations.map((g) => [g.id, g]));
          return current.map((item) => updates.get(item.id) ?? item);
        });
        setTokenBalance(data.tokenBalance);
      } catch {
        /* lỗi mạng tạm thời — lần poll sau sẽ thử lại */
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pendingKey, setTokenBalance]);

  // --- Hành động ------------------------------------------------------------
  const toDataUri = (image: ImageState) => `data:${image.mimeType};base64,${image.base64}`;

  const handleGenerate = async () => {
    if (!selectedModel || prodImages.length === 0) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const data = await api.post<{ generations: Generation[]; tokenBalance: number }>('/generations', {
        modelCode: selectedModel.code,
        aspectRatio,
        prompt,
        referenceImages: refImages.map(toDataUri),
        productImages: prodImages.map(toDataUri),
        quantityPerReference: quantity,
      });

      setGenerations((current) => [...data.generations, ...current]);
      setTokenBalance(data.tokenBalance);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Không tạo được ảnh.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedo = async () => {
    if (!redoTarget) return;
    const target = redoTarget;
    setRedoTarget(null);
    setError(null);

    try {
      const data = await api.post<{ generation: Generation; tokenBalance: number }>(
        `/generations/${target.id}/redo`,
        { prompt: redoPrompt },
      );
      if (data.generation) setGenerations((current) => [data.generation, ...current]);
      setTokenBalance(data.tokenBalance);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Không vẽ lại được.'));
    }
  };

  const handleDownload = useCallback(async (url: string, fileName: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('tải thất bại');
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }, []);

  if (catalogError) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Alert tone="error">{catalogError}</Alert>
      </div>
    );
  }
  if (!catalog) return <PageLoader label="Đang tải bảng giá..." />;

  const canSubmit = Boolean(selectedModel) && prodImages.length > 0 && !notEnoughTokens && !isSubmitting && isSubscribed;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      {/* ================= CỘT TRÁI: CẤU HÌNH ================= */}
      <aside className="w-[380px] flex-shrink-0 flex flex-col border-r border-dark-800 bg-dark-900">
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-6">
          <ImageUploadBox
            label="1. Ảnh mẫu (style)"
            subText="AI học bố cục, ánh sáng và màu sắc từ ảnh này."
            images={refImages}
            onImagesChange={setRefImages}
            allowMultiple
          />

          <div className="flex justify-center text-dark-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>

          <ImageUploadBox
            label="2. Ảnh sản phẩm"
            subText="Tối đa 3 ảnh. AI sẽ đưa sản phẩm vào thiết kế."
            images={prodImages}
            onImagesChange={setProdImages}
            allowMultiple
          />
          {prodImages.length > 3 && (
            <p className="text-[11px] text-amber-400 -mt-3">Chỉ 3 ảnh sản phẩm đầu tiên được sử dụng.</p>
          )}

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-gray-300 uppercase tracking-wider">3. Mô tả thêm</span>
              <span className="text-xs text-gray-500">{prompt.length} ký tự</span>
            </div>
            <textarea
              className="w-full bg-dark-850 border border-dark-700 rounded-xl p-3 text-sm text-gray-200 focus:border-brand-500 outline-none resize-none h-24 placeholder-gray-600 custom-scrollbar"
              placeholder="VD: Đặt sản phẩm lên bàn gỗ, ánh sáng vàng ấm, thêm lá khô trang trí..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="space-y-4 pt-4 border-t border-dark-800">
            <span className="text-sm font-bold text-gray-300 uppercase tracking-wider">4. Cấu hình AI</span>

            <div>
              <span className="text-xs text-gray-500 mb-1.5 block">Model</span>
              <div className="grid grid-cols-1 gap-1.5">
                {families.map((item) => {
                  const cheapest = Math.min(
                    ...catalog.models.filter((m) => m.family === item.key).map((m) => m.tokenCost),
                  );
                  return (
                    <button
                      key={item.key}
                      onClick={() => {
                        setFamily(item.key);
                        const options = catalog.models.filter((m) => m.family === item.key);
                        setResolution(options.find((m) => m.resolution === resolution)?.resolution ?? options[0].resolution);
                      }}
                      className={`text-left px-3 py-2 rounded-xl border text-sm transition-colors ${
                        family === item.key
                          ? 'border-brand-500 bg-brand-500/10 text-gray-100'
                          : 'border-dark-700 bg-dark-850 text-gray-400 hover:border-dark-600'
                      }`}
                    >
                      <span className="font-semibold">{item.label}</span>
                      <span className="text-[11px] text-gray-500 ml-2">từ {cheapest} token/ảnh</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Xếp dọc: nhãn tỉ lệ khá dài, đặt cạnh nhau sẽ bị cắt chữ trong cột 380px */}
            <div className="space-y-4">
              {/* Model chỉ có một mức chất lượng (vd bản Lite) thì không cần cho chọn */}
              <div className={resolutionOptions.length > 1 ? '' : 'hidden'}>
                <span className="text-xs text-gray-500 mb-1.5 block">Chất lượng</span>
                <div className="flex gap-1.5">
                  {resolutionOptions.map((model) => (
                    <button
                      key={model.code}
                      onClick={() => setResolution(model.resolution)}
                      title={`${model.tokenCost} token/ảnh`}
                      className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-colors ${
                        resolution === model.resolution
                          ? 'border-brand-500 bg-brand-500/10 text-gray-100'
                          : 'border-dark-700 bg-dark-850 text-gray-400 hover:border-dark-600'
                      }`}
                    >
                      {model.resolution}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs text-gray-500 mb-1.5 block">Tỉ lệ ảnh</span>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full bg-dark-850 border border-dark-700 text-gray-200 text-xs rounded-lg px-2.5 py-2.5 outline-none focus:border-brand-500 cursor-pointer"
                >
                  {ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio.value} value={ratio.value}>
                      {ratio.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-gray-500">Số ảnh mỗi mẫu</span>
                <span className="text-xs font-bold text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded">{quantity}</span>
              </div>
              <input
                type="range"
                min={1}
                max={4}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full h-1.5 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>

            {selectedModel?.notes && <p className="text-[11px] text-gray-500 leading-relaxed">{selectedModel.notes}</p>}
          </div>
        </div>

        {/* Chi phí + nút tạo */}
        <div className="p-5 border-t border-dark-800 bg-dark-900 space-y-3">
          {error && (
            <Alert tone="error">
              {error.message}
              {error instanceof ApiError && error.isInsufficientTokens && (
                <Link to="/nap-tien" className="block mt-2 font-bold underline">
                  Nạp thêm token →
                </Link>
              )}
            </Alert>
          )}

          <div className="flex justify-between items-baseline text-sm">
            <span className="text-gray-500">
              {jobCount} ảnh × {selectedModel?.tokenCost ?? 0} token
            </span>
            <span className={`font-bold text-lg ${notEnoughTokens ? 'text-red-400' : 'text-gray-100'}`}>
              {formatNumber(totalCost)} token
            </span>
          </div>

          {!isSubscribed ? (
            <Link to="/nap-tien" className="block">
              <Button className="w-full !rounded-xl">Đăng ký gói dịch vụ để bắt đầu</Button>
            </Link>
          ) : notEnoughTokens ? (
            <Link to="/nap-tien" className="block">
              <Button className="w-full !rounded-xl" variant="secondary">
                Không đủ token · Mua thêm
              </Button>
            </Link>
          ) : (
            <Button onClick={handleGenerate} isLoading={isSubmitting} disabled={!canSubmit} className="w-full !rounded-xl">
              {prodImages.length === 0 ? 'Cần ít nhất 1 ảnh sản phẩm' : `Tạo ${jobCount} thiết kế`}
            </Button>
          )}

          {isSubscribed ? (
            <p className="text-[11px] text-gray-600 text-center leading-relaxed">
              Hạn mức tháng {formatNumber(user?.monthlyTokens ?? 0)}
              {(user?.purchasedTokens ?? 0) > 0 && <> · mua thêm {formatNumber(user!.purchasedTokens)}</>}
              <br />
              Trừ hạn mức tháng trước · ảnh lỗi được hoàn token tự động.
            </p>
          ) : (
            <p className="text-[11px] text-gray-600 text-center">
              Cần có gói dịch vụ theo tháng mới tạo được ảnh.
            </p>
          )}
        </div>
      </aside>

      {/* ================= CỘT PHẢI: KẾT QUẢ ================= */}
      <section className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 border-b border-dark-800 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-base font-semibold text-gray-200">
            Kết quả gần đây
            {pendingIds.length > 0 && (
              <span className="text-xs text-brand-500 font-normal ml-2">• {pendingIds.length} ảnh đang xử lý</span>
            )}
          </h2>
          <Link to="/lich-su" className="text-xs text-gray-500 hover:text-gray-100 transition-colors">
            Xem toàn bộ lịch sử →
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {generations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-700 select-none">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={0.6}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-base font-medium text-gray-500">Chưa có thiết kế nào.</p>
              <p className="text-sm mt-1">Tải ảnh mẫu và ảnh sản phẩm ở cột bên trái để bắt đầu.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 pb-10">
              {generations.map((item) => (
                <GenerationCard
                  key={item.id}
                  generation={item}
                  onPreview={setPreviewUrl}
                  onDownload={handleDownload}
                  onRedo={(target) => {
                    setRedoTarget(target);
                    setRedoPrompt(target.prompt ?? '');
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button className="absolute top-5 right-5 text-white/60 hover:text-white bg-white/5 rounded-full p-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={previewUrl}
            alt="Xem lớn"
            className="max-w-full max-h-full object-contain rounded-lg border border-white/10"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {redoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-100 mb-1">Vẽ lại thiết kế</h3>
            <p className="text-sm text-gray-500 mb-4">
              Dùng lại đúng ảnh mẫu và ảnh sản phẩm cũ, chỉ đổi mô tả. Trừ {redoTarget.tokenCost} token.
            </p>
            <textarea
              className="w-full bg-dark-850 border border-dark-700 rounded-xl p-3 text-gray-100 focus:border-brand-500 outline-none min-h-[120px] mb-4 custom-scrollbar text-sm"
              placeholder="VD: Thêm logo góc trái, làm sáng nền, đổi tông sang xanh navy..."
              value={redoPrompt}
              onChange={(e) => setRedoPrompt(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setRedoTarget(null)}>
                Huỷ
              </Button>
              <Button onClick={handleRedo}>Vẽ lại · {redoTarget.tokenCost} token</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const GenerationCard: React.FC<{
  generation: Generation;
  onPreview: (url: string) => void;
  onDownload: (url: string, fileName: string) => void;
  onRedo: (generation: Generation) => void;
}> = ({ generation, onPreview, onDownload, onRedo }) => (
  <div className="group relative bg-dark-900 rounded-2xl overflow-hidden border border-dark-800 flex flex-col hover:border-dark-600 transition-colors">
    <div className="relative aspect-[3/4] bg-dark-850">
      {generation.status === 'success' && generation.imageUrl ? (
        <>
          <img src={generation.imageUrl} alt="Kết quả" className="w-full h-full object-contain" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
            <button
              onClick={() => onDownload(generation.imageUrl!, `copycat-${generation.id}.png`)}
              className="bg-white hover:bg-gray-100 text-black p-3 rounded-full transition-transform hover:scale-110"
              title="Tải xuống"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              onClick={() => onPreview(generation.imageUrl!)}
              className="bg-dark-700 hover:bg-dark-600 text-gray-100 p-3 rounded-full border border-gray-600 transition-transform hover:scale-110"
              title="Xem lớn"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
            <button
              onClick={() => onRedo(generation)}
              className="bg-brand-600 hover:bg-brand-500 text-white p-3 rounded-full transition-transform hover:scale-110"
              title="Vẽ lại"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        </>
      ) : generation.status === 'failed' || generation.status === 'refunded' ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-red-950/20 p-4 text-center gap-2">
          <span className="text-xs text-red-400 line-clamp-4">{generation.errorMessage}</span>
          {generation.status === 'refunded' && (
            <span className="text-[10px] text-green-500">Đã hoàn {generation.tokenCost} token</span>
          )}
          <button onClick={() => onRedo(generation)} className="text-[11px] text-gray-100 underline mt-1">
            Thử lại
          </button>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
          <Spinner className="h-9 w-9 text-brand-500" />
          <span className="text-xs text-brand-500 animate-pulse font-medium">{STATUS_LABEL[generation.status]}...</span>
        </div>
      )}
    </div>

    <div className="p-3 border-t border-dark-800 flex justify-between items-center gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {generation.referenceUrl && (
          <img
            src={generation.referenceUrl}
            className="w-6 h-6 rounded border border-dark-700 object-cover shrink-0"
            alt="mẫu"
            title="Ảnh mẫu"
          />
        )}
        <div className="flex -space-x-1.5">
          {generation.productUrls.slice(0, 3).map((url) => (
            <img
              key={url}
              src={url}
              className="w-6 h-6 rounded-full border border-dark-900 object-cover"
              alt="sản phẩm"
              title="Ảnh sản phẩm"
            />
          ))}
        </div>
        <span className="text-[10px] text-gray-600 truncate ml-1">{generation.modelLabel}</span>
      </div>
      <span className="text-[10px] text-gray-500 shrink-0">{generation.tokenCost} token</span>
    </div>
  </div>
);

function readSettings(): StoredSettings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as StoredSettings;
  } catch {
    return {};
  }
}
