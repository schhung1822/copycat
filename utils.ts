import { ImageState } from './types';

export const fileToImageState = (file: File): Promise<ImageState> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    
    img.onload = () => {
      // AGGRESSIVE RESIZE: 
      // Large Base64 payloads cause "Failed to fetch" (Network Error) in browsers.
      // Max 800px ensures payload is ~300KB-500KB per image, safer for arrays.
      const MAX_DIMENSION = 800; 
      let width = img.width;
      let height = img.height;
      
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not create canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      
      // QUALITY REDUCTION:
      // 0.7 is acceptable for AI input reference, significantly reduces size.
      const outputMime = 'image/jpeg';
      const base64String = canvas.toDataURL(outputMime, 0.7);
      
      const match = base64String.match(/^data:(.*);base64,(.*)$/);
      
      if (match) {
        resolve({
          file,
          previewUrl: base64String, 
          mimeType: match[1],
          base64: match[2],
          width: width,
          height: height
        });
      } else {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to parse base64 string"));
      }
      
      URL.revokeObjectURL(objectUrl);
    };
    
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for processing"));
    };
    
    img.src = objectUrl;
  });
};

export const filesToImageStates = async (files: FileList | File[]): Promise<ImageState[]> => {
  const promises: Promise<ImageState>[] = [];
  const fileArray = Array.isArray(files) ? files : Array.from(files);
  
  for (const file of fileArray) {
    promises.push(fileToImageState(file));
  }
  return Promise.all(promises);
};