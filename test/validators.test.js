import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedDocument } from '../src/validators.js';

test('accepts supported article file formats', () => {
  assert.equal(isAllowedDocument({ file_name: 'article.pdf', mime_type: 'application/pdf' }), true);
  assert.equal(isAllowedDocument({ file_name: 'article.doc', mime_type: 'application/octet-stream' }), true);
  assert.equal(isAllowedDocument({ file_name: 'article.docx' }), true);
});

test('rejects unsupported file formats', () => {
  assert.equal(isAllowedDocument({ file_name: 'image.png', mime_type: 'image/png' }), false);
  assert.equal(isAllowedDocument({ file_name: 'archive.zip', mime_type: 'application/zip' }), false);
});
