import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const dbPath = path.join(config.dataDir, 'db.json');
const filesDir = path.join(config.dataDir, 'submissions');

const initialDb = {
  submissions: {},
  userDrafts: {},
};

let db = structuredClone(initialDb);
let writeQueue = Promise.resolve();

export async function initStorage() {
  await fs.mkdir(filesDir, { recursive: true });

  try {
    const raw = await fs.readFile(dbPath, 'utf8');
    db = { ...structuredClone(initialDb), ...JSON.parse(raw) };
    db.submissions ??= {};
    db.userDrafts ??= {};
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    await persist();
  }
}

export function getFilesDir() {
  return filesDir;
}

export function getSubmission(id) {
  return db.submissions[id] ?? null;
}

export function findSubmissionByPaymeTransactionId(paymeTransactionId) {
  return Object.values(db.submissions).find((submission) => {
    return submission.payment?.transaction?.paymeId === paymeTransactionId;
  }) ?? null;
}

export function getUserDraft(userId) {
  return db.userDrafts[String(userId)] ?? null;
}

export function listUserSubmissions(userId) {
  return Object.values(db.submissions)
    .filter((submission) => submission.user.id === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveUserDraft(userId, draft) {
  db.userDrafts[String(userId)] = draft;
  await persist();
}

export async function clearUserDraft(userId) {
  delete db.userDrafts[String(userId)];
  await persist();
}

export async function createSubmission(submission) {
  db.submissions[submission.id] = submission;
  await persist();
  return submission;
}

export async function updateSubmission(id, patch) {
  const current = getSubmission(id);
  if (!current) {
    throw new Error(`Submission not found: ${id}`);
  }

  db.submissions[id] = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await persist();
  return db.submissions[id];
}

async function persist() {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(config.dataDir, { recursive: true });
    const tmpPath = `${dbPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(db, null, 2));
    await fs.rename(tmpPath, dbPath);
  });

  return writeQueue;
}
