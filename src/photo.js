// Shrink a chosen picture to a small square so it fits in the profile record.

export function readProfilePhoto(file) {
  if (!file || !file.type.startsWith("image/")) {
    return Promise.reject(new Error("Choose an image file."));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const scale = Math.max(size / img.width, size / img.height);
      const sw = size / scale;
      const sh = size / scale;
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;
      canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);
      let url = canvas.toDataURL("image/jpeg", 0.72);
      if (url.length > 180000) url = canvas.toDataURL("image/jpeg", 0.5);
      if (url.length > 180000) {
        reject(new Error("That photo is too large."));
        return;
      }
      resolve(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image."));
    };
    img.src = objectUrl;
  });
}

// Shrink a food photo (longest side 768px) for Gemini. Returns the JPEG as base64, without the "data:" prefix.
export function readFoodPhoto(file) {
  if (!file || !file.type.startsWith("image/")) {
    return Promise.reject(new Error("Choose an image file."));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 768 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.8).split(",")[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image."));
    };
    img.src = objectUrl;
  });
}
