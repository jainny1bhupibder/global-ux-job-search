import { promises as fs } from 'node:fs';
import path from 'node:path';

export type Job = {
  id: string; title: string; company: string; location?: string; salary?: string;
  sourceUrl?: string; sourceName?: string; publishedAt?: string; status?: string;
  verificationStatus?: string; remote?: boolean; jobType?: string; description?: string;
  notes?: string; draft?: string; appliedAt?: string; updatedAt?: string;
};
const dataDir = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'jobs.json');

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try { await fs.access(dataFile); }
  catch { await fs.writeFile(dataFile, '[]\n', { flag: 'wx' }).catch(async e => { if (e.code !== 'EEXIST') throw e; }); }
}
export async function readJobs(): Promise<Job[]> {
  await ensureStore();
  const raw = await fs.readFile(dataFile, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Local job storage is not a valid array; refusing to overwrite it.');
  return parsed;
}
export async function writeJobs(jobs: Job[]) {
  if (!Array.isArray(jobs)) throw new Error('Refusing to write invalid job data.');
  await ensureStore();
  const tmp = dataFile + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(jobs, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, dataFile);
}
