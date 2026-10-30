import { promises as fs } from 'node:fs';
import path from 'node:path';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

export type Job = {
  id: string;
  title: string;
  company: string;
  location?: string;
  salary?: string;
  sourceUrl?: string;
  sourceName?: string;
  publishedAt?: string;
  status?: string;
  verificationStatus?: string;
  remote?: boolean;
  jobType?: string;
  description?: string;
  notes?: string;
  draft?: string;
  appliedAt?: string;
  updatedAt?: string;
  discoveredAt?: string;
  deadline?: string;
  followUpAt?: string;
  approvedAt?: string;
  handoff?: { reason: string; note?: string; at: string };
  draftHistory?: { draft: string; savedAt: string }[];
};

// JOB_DATA_DIR lets tests run against a scratch copy instead of ./data.
const dataDir = process.env.JOB_DATA_DIR
  ? path.resolve(process.env.JOB_DATA_DIR)
  : path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'jobs.json');
const blobPath = 'global-ux-job-search/jobs.json';

function useBlob(): boolean {
  return process.env.VERCEL === '1' || process.env.JOB_STORAGE === 'blob';
}

function validateJobs(value: unknown): Job[] {
  if (!Array.isArray(value)) {
    throw new Error('Job storage is not a valid array; refusing to overwrite it.');
  }

  for (const job of value) {
    if (
      !job ||
      typeof job !== 'object' ||
      typeof job.id !== 'string' ||
      !job.id.trim() ||
      typeof job.title !== 'string' ||
      typeof job.company !== 'string'
    ) {
      throw new Error('Job storage contains an invalid record; refusing to overwrite it.');
    }
  }

  return value as Job[];
}

async function readLocalJobs(): Promise<Job[]> {
  const raw = await fs.readFile(dataFile, 'utf8');
  return validateJobs(JSON.parse(raw));
}

// Blob returns a weak etag (W/"...") for larger or compressed files, but ifMatch only
// accepts a strong one. The opaque value is the same, so drop the weak prefix.
export const strongEtag = (etag: string): string => etag.replace(/^W\//, '');

async function readBlobSnapshot(): Promise<{ jobs: Job[]; etag: string }> {
  const result = await get(blobPath, {
    access: 'private',
    useCache: false,
  });

  if (!result) {
    throw new Error(
      'Production job storage is not initialized. Run the guarded migration first.'
    );
  }

  if (result.statusCode !== 200 || !result.stream) {
    throw new Error('Could not retrieve production job storage.');
  }

  const raw = await new Response(result.stream).text();
  return { jobs: validateJobs(JSON.parse(raw)), etag: strongEtag(result.blob.etag) };
}

export async function readJobs(): Promise<Job[]> {
  if (!useBlob()) return readLocalJobs();
  return (await readBlobSnapshot()).jobs;
}

async function writeLocalJobs(jobs: Job[]): Promise<void> {
  validateJobs(jobs);
  await fs.mkdir(dataDir, { recursive: true });

  const tmp = `${dataFile}.${process.pid}.${Date.now()}.tmp`;

  try {
    await fs.writeFile(tmp, JSON.stringify(jobs, null, 2) + '\n', {
      encoding: 'utf8',
      flag: 'wx',
    });
    await fs.rename(tmp, dataFile);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}

export async function updateJobs(
  mutate: (current: Job[]) => Job[]
): Promise<Job[]> {
  if (!useBlob()) {
    const current = await readLocalJobs();
    const next = validateJobs(mutate(current));
    await writeLocalJobs(next);
    return next;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await readBlobSnapshot();
    const next = validateJobs(mutate(snapshot.jobs));

    try {
      await put(blobPath, JSON.stringify(next, null, 2) + '\n', {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: snapshot.etag,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      return next;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) {
        if (attempt < 4) continue;
        throw new Error('Repeated storage conflicts. Please retry the operation.');
      }
      throw error;
    }
  }

  throw new Error('Job storage update could not be completed safely.');
}

// Small JSON documents (scheduler state, run log) stored beside jobs.json with
// the same conditional-write protection. A missing document starts from fallback.
export async function updateDoc<T>(
  name: string,
  fallback: T,
  mutate: (current: T) => T
): Promise<T> {
  const file = path.join(dataDir, `${name}.json`);
  const pathname = `global-ux-job-search/${name}.json`;

  if (!useBlob()) {
    let current = fallback;
    try {
      current = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const next = mutate(current);
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      await fs.rename(tmp, file);
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
    return next;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await get(pathname, { access: 'private', useCache: false });
    let current = fallback;
    let etag: string | undefined;
    if (result) {
      if (result.statusCode !== 200 || !result.stream) {
        throw new Error(`Could not retrieve ${name} storage.`);
      }
      current = JSON.parse(await new Response(result.stream).text());
      etag = strongEtag(result.blob.etag);
    }
    const next = mutate(current);

    try {
      await put(pathname, JSON.stringify(next, null, 2) + '\n', {
        access: 'private',
        addRandomSuffix: false,
        // Create-only when absent, otherwise only overwrite the version we read.
        allowOverwrite: Boolean(etag),
        ...(etag ? { ifMatch: etag } : {}),
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      return next;
    } catch (error: any) {
      const conflict =
        error instanceof BlobPreconditionFailedError ||
        (!etag && /already exists/i.test(String(error?.message)));
      if (conflict && attempt < 4) continue;
      if (conflict) throw new Error('Repeated storage conflicts. Please retry the operation.');
      throw error;
    }
  }

  throw new Error(`${name} storage update could not be completed safely.`);
}

export async function readDoc<T>(name: string, fallback: T): Promise<T> {
  if (!useBlob()) {
    try {
      return JSON.parse(await fs.readFile(path.join(dataDir, `${name}.json`), 'utf8'));
    } catch (error: any) {
      if (error?.code === 'ENOENT') return fallback;
      throw error;
    }
  }
  const result = await get(`global-ux-job-search/${name}.json`, { access: 'private', useCache: false });
  if (!result) return fallback;
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`Could not retrieve ${name} storage.`);
  }
  return JSON.parse(await new Response(result.stream).text());
}
