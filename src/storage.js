import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { AppDataSource } from './dataSource.js';

const filesDir = path.join(config.uploadDir, 'submissions');

let submissionRepository;
let draftRepository;

export async function initStorage() {
  await fs.mkdir(filesDir, { recursive: true });

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  submissionRepository = AppDataSource.getRepository('Submission');
  draftRepository = AppDataSource.getRepository('UserDraft');
}

export function getFilesDir() {
  return filesDir;
}

export async function getSubmission(id) {
  return submissionRepository.findOneBy({ id });
}

export async function getUserDraft(userId) {
  const row = await draftRepository.findOneBy({ userId: String(userId) });
  return row?.draft ?? null;
}

export async function listUserSubmissions(userId) {
  return submissionRepository
    .createQueryBuilder('submission')
    .where("submission.user ->> 'id' = :userId", { userId: String(userId) })
    .orderBy('submission.createdAt', 'DESC')
    .getMany();
}

export async function saveUserDraft(userId, draft) {
  await draftRepository.save({
    userId: String(userId),
    draft,
  });
}

export async function clearUserDraft(userId) {
  await draftRepository.delete({ userId: String(userId) });
}

export async function createSubmission(submission) {
  return submissionRepository.save(submission);
}

export async function updateSubmission(id, patch) {
  const current = await getSubmission(id);
  if (!current) {
    throw new Error(`Submission not found: ${id}`);
  }

  const updated = {
    ...current,
    ...patch,
  };

  await submissionRepository.save(updated);
  return getSubmission(id);
}

export async function closeStorage() {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
