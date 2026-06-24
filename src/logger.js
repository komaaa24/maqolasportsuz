import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const paymeLogPath = path.join(config.logDir, 'payme.log');

export async function logPayme(event, details = {}) {
  const entry = {
    time: new Date().toISOString(),
    event,
    ...sanitize(details),
  };

  const line = JSON.stringify(entry) + '\n';
  console.log(event, entry);

  try {
    await fs.mkdir(config.logDir, { recursive: true });
    await fs.appendFile(paymeLogPath, line);
  } catch (error) {
    console.error('payme_log_write_failed', error);
  }
}

function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/authorization|password|token|key|secret/i.test(key)) {
        return [key, '[redacted]'];
      }

      return [key, sanitize(item)];
    }),
  );
}
