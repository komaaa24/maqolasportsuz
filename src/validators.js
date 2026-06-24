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
