const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const allowedExtensions = new Set(['.pdf', '.doc', '.docx']);

export function isAllowedDocument(document) {
  const name = document.file_name ?? '';
  const ext = getExtension(name);

  return allowedExtensions.has(ext) || allowedMimeTypes.has(document.mime_type);
}

export function getExtension(fileName) {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) {
    return '';
  }

  return fileName.slice(dotIndex).toLowerCase();
}

export function parseCardInput(text) {
  const normalized = text.replace(/[^\d\s/]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = normalized.split(' ');

  const number = parts.find((part) => /^\d{16}$/.test(part));
  const expirePart = parts.find((part) => /^(\d{2}\/?\d{2}|\d{4})$/.test(part) && part !== number);

  if (!number || !expirePart) {
    return null;
  }

  const expire = expirePart.replace('/', '');
  const month = Number(expire.slice(0, 2));

  if (!/^\d{4}$/.test(expire) || month < 1 || month > 12) {
    return null;
  }

  return { number, expire };
}

export function parseOtp(text) {
  const code = text.replace(/\D/g, '');
  return code.length >= 4 && code.length <= 8 ? code : null;
}
