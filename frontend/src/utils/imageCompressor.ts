/**
 * Client-side image compression and resizing utility for AI Vision uploads.
 * Constrains dimensions to max 1280px and compresses to quality JPEG/WebP to prevent HTTP 413
 * and ensure sub-second transmission over mobile networks while preserving crisp details.
 */
export interface CompressedImage {
  data: string; // Base64 data without data-uri prefix
  mimeType: string;
  previewUrl: string; // Full data URI for UI thumbnail display
}

export async function compressImage(
  file: File,
  maxDimension = 1280,
  quality = 0.82
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    // If not an image, reject
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image.'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to parse image data.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Downscale while preserving aspect ratio if exceeding maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          // Fallback to raw data
          const rawUrl = reader.result as string;
          const rawBase64 = rawUrl.split(',')[1] || '';
          return resolve({
            data: rawBase64,
            mimeType: file.type || 'image/jpeg',
            previewUrl: rawUrl
          });
        }

        // Use high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // For crisp screenshots, if original is PNG and under 600KB, keep PNG; otherwise compress to JPEG
        const targetMime = file.type === 'image/png' && file.size < 600 * 1024 ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(targetMime, targetMime === 'image/jpeg' ? quality : undefined);
        const base64Data = dataUrl.split(',')[1] || '';

        resolve({
          data: base64Data,
          mimeType: targetMime,
          previewUrl: dataUrl
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
