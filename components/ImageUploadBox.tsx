import React, { useRef, useState } from 'react';
import { ImageState } from '../types';
import { filesToImageStates, fileToImageState } from '../utils';

interface ImageUploadBoxProps {
  label: string;
  images: ImageState[];
  onImagesChange: (images: ImageState[]) => void;
  subText?: string;
  allowMultiple?: boolean;
}

export const ImageUploadBox: React.FC<ImageUploadBoxProps> = ({ 
  label, 
  images, 
  onImagesChange, 
  subText,
  allowMultiple = true
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const processFiles = async (files: FileList | File[]) => {
    if (files.length > 0) {
      try {
        const newImages = await filesToImageStates(files);
        if (allowMultiple) {
          onImagesChange([...images, ...newImages]);
        } else {
          onImagesChange([newImages[0]]);
        }
      } catch (err) {
        console.error("Error reading file", err);
      }
      // Reset input so same file can be selected again if needed
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
  };

  const handlePasteButtonClick = async () => {
    // Attempt to focus the container first
    containerRef.current?.focus();

    try {
      const clipboardItems = await navigator.clipboard.read();
      const newImages: ImageState[] = [];
      
      for (const item of clipboardItems) {
        // Find image types in clipboard
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "pasted-image.png", { type: imageType });
          const imgState = await fileToImageState(file);
          newImages.push(imgState);
        }
      }

      if (newImages.length > 0) {
        if (allowMultiple) {
          onImagesChange([...images, ...newImages]);
        } else {
          onImagesChange([newImages[0]]);
        }
      } else {
        alert("Không tìm thấy hình ảnh trong bộ nhớ tạm. Hãy thử nhấn Ctrl+V.");
      }
    } catch (err) {
      console.warn("Clipboard API blocked", err);
      alert("Trình duyệt chặn dán tự động. Vui lòng nhấn Ctrl+V vào vùng upload.");
    }
  };

  const handlePasteEvent = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      await processFiles(e.clipboardData.files);
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    onImagesChange(newImages);
  };

  const triggerUpload = () => {
    inputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      await processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col gap-2 w-full outline-none transition-all duration-200 rounded-xl ${isFocused ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-dark-900' : ''}`}
      tabIndex={0}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPaste={handlePasteEvent}
    >
      <div className="flex justify-between items-center">
        <label 
          className="text-sm font-bold text-gray-300 uppercase tracking-wider cursor-pointer select-none"
          onClick={() => containerRef.current?.focus()}
        >
          {label} <span className="text-brand-500">({images.length})</span>
        </label>
        <button 
          onClick={handlePasteButtonClick}
          className="text-xs bg-dark-700 hover:bg-dark-600 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors"
          title="Dán từ Clipboard (hoặc nhấn Ctrl+V)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Dán ảnh
        </button>
      </div>
      
      {/* Upload Area */}
      {images.length === 0 ? (
        <div 
          className={`
            relative border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center
            transition-all duration-300 cursor-pointer overflow-hidden group
            ${isDragging ? 'border-brand-500 bg-brand-500/10' : 'border-gray-700 hover:border-gray-500 hover:bg-dark-800'}
            ${isFocused ? 'bg-dark-800/50 border-gray-600' : ''}
          `}
          onClick={triggerUpload}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
           <div className="text-center p-6 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-10 w-10 mx-auto mb-2 transition-colors ${isFocused ? 'text-brand-500' : 'text-gray-500 group-hover:text-brand-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-300 font-medium text-sm">Nhấn, kéo thả hoặc <span className="text-brand-500 font-bold">Ctrl+V</span></p>
            {subText && <p className="text-xs text-gray-500 mt-1">{subText}</p>}
          </div>
        </div>
      ) : (
        <div className={`bg-dark-800 p-3 rounded-xl border ${isFocused ? 'border-brand-500' : 'border-dark-700'} transition-colors`}>
           {/* Grid for multiple images */}
          <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
            {images.map((img, idx) => (
              <div key={idx} className="relative aspect-[3/4] group rounded-lg overflow-hidden border border-gray-700">
                <img 
                  src={img.previewUrl || ''} 
                  alt={`Upload ${idx}`} 
                  className="w-full h-full object-cover"
                />
                <button 
                  onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                  className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
            {/* Add More Button */}
            <div 
              onClick={triggerUpload}
              className="aspect-[3/4] border border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-dark-700 hover:border-brand-500 transition-colors"
            >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[10px] text-gray-400 mt-1">Thêm</span>
            </div>
          </div>
        </div>
      )}

      <input 
        type="file" 
        ref={inputRef}
        onChange={handleFileChange} 
        accept="image/*" 
        multiple={allowMultiple}
        className="hidden" 
      />
    </div>
  );
};
