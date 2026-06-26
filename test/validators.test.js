import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedDocument, parseCardInput, parseOtp } from '../src/validators.js';

test('accepts supported article file formats', () => {
  assert.equal(isAllowedDocument({ file_name: 'article.pdf', mime_type: 'application/pdf' }), true);
  assert.equal(isAllowedDocument({ file_name: 'article.doc', mime_type: 'application/octet-stream' }), true);
  assert.equal(isAllowedDocument({ file_name: 'article.docx' }), true);
});

test('rejects unsupported file formats', () => {
  assert.equal(isAllowedDocument({ file_name: 'image.png', mime_type: 'image/png' }), false);
  assert.equal(isAllowedDocument({ file_name: 'archive.zip', mime_type: 'application/zip' }), false);
});

test('parses card input for Payme tokenization', () => {
  assert.deepEqual(parseCardInput('8600123412341234 03/29'), {
    number: '8600123412341234',
    expire: '0329',
  });

  assert.equal(parseCardInput('860012341234123 03/29'), null);
  assert.equal(parseCardInput('8600123412341234 13/29'), null);
});

test('parses Payme OTP code', () => {
  assert.equal(parseOtp('123456'), '123456');
  assert.equal(parseOtp('code: 1234'), '1234');
  assert.equal(parseOtp('12'), null);
});
