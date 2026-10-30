from pathlib import Path
from datetime import datetime
import json
import shutil
import re
import sys

files = [
    Path("lib/store.ts"),
    Path("app/api/jobs/route.ts"),
    Path("app/api/discover/route.ts"),
    Path("data/jobs.json"),
]

for path in files:
    if not path.is_file():
        sys.exit(f"STOP: missing file: {path}")

jobs = json.loads(Path("data/jobs.json").read_text(encoding="utf-8"))
if not isinstance(jobs, list) or any(
    not isinstance(j, dict) or not j.get("id") for j in jobs
):
    sys.exit("STOP: local jobs data failed validation.")

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = Path.home() / f"global-ux-job-search-patch-backup-{stamp}"
backup.mkdir(parents=True, exist_ok=False)

for path in files:
    dest = backup / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)

print("Backup created:", backup)
print("Validated local jobs:", len(jobs))
print("Saved drafts:", sum(bool(j.get("draft")) for j in jobs))

store = """import { promises as fs } from 'node:fs';
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
};

const dataDir = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'jobs.json');
const blobPath = 'global-ux-job-search/jobs.json';

function useBlob(): boolean {
  return process.env.VERCEL === '1' || process.env.JOB_STORAGE === 'blob';
}

function validateJobs(value: unknown): Job[] {
  if (!Array.isArray(value)) throw new Error('Invalid job storage; refusing to overwrite.');
  for (const job of value) {
    if (!job || typeof job !== 'object' ||
        typeof job.id !== 'string' || !job.id.trim() ||
        typeof job.title !== 'string' || typeof job.company !== 'string') {
      throw new Error('Invalid job record; refusing to overwrite storage.');
    }
  }
  return value as Job[];
}

async function readLocalJobs(): Promise<Job[]> {
  return validateJobs(JSON.parse(await fs.readFile(dataFile, 'utf8')));
}

async function readBlobSnapshot(): Promise<{ jobs: Job[]; etag: string }> {
  const result = await get(blobPath, { access: 'private', useCache: false });
  if (!result) throw new Error('Production job storage is not initialized.');
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error('Could not read production job storage.');
  }
  const raw = await new Response(result.stream).text();
  return { jobs: validateJobs(JSON.parse(raw)), etag: result.blob.etag };
}

export async function readJobs(): Promise<Job[]> {
  return useBlob() ? (await readBlobSnapshot()).jobs : readLocalJobs();
}

async function writeLocalJobs(jobs: Job[]): Promise<void> {
  validateJobs(jobs);
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(jobs, null, 2) + '\\n', {
      encoding: 'utf8', flag: 'wx'
    });
    await fs.rename(tmp, dataFile);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}

export async function updateJobs(mutate: (current: Job[]) => Job[]): Promise<Job[]> {
  if (!useBlob()) {
    const next = validateJobs(mutate(await readLocalJobs()));
    await writeLocalJobs(next);
    return next;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await readBlobSnapshot();
    const next = validateJobs(mutate(snapshot.jobs));
    try {
      await put(blobPath, JSON.stringify(next, null, 2) + '\\n', {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: snapshot.etag,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      return next;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError && attempt < 4) continue;
      throw error;
    }
  }
  throw new Error('Storage update failed after repeated conflicts.');
}
"""

jobs_route = """import { NextResponse } from 'next/server';
import { readJobs, updateJobs, type Job } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, jobs: await readJobs() }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('Job read failed safely', error);
    return NextResponse.json({ error: 'Could not read job storage.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' }
    });
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
  }

  try {
    if (body.action === 'upsert' && body.job) {
      const job = body.job as Job;
      if (typeof job.id !== 'string' || !job.id.trim() ||
          typeof job.title !== 'string' || typeof job.company !== 'string') {
        return NextResponse.json({ error: 'A valid job ID, title, and company are required.' }, { status: 400 });
      }
      const jobs = await updateJobs(current => {
        const exists = current.some(item => item.id === job.id);
        return exists
          ? current.map(item => item.id === job.id ? { ...item, ...job } : item)
          : [job, ...current];
      });
      return NextResponse.json({ ok: true, jobs });
    }

    if (body.action === 'update' && body.id && body.patch &&
        typeof body.patch === 'object' && !Array.isArray(body.patch)) {
      if (Object.prototype.hasOwnProperty.call(body.patch, 'id')) {
        return NextResponse.json({ error: 'Job IDs cannot be changed.' }, { status: 400 });
      }
      let found = false;
      const jobs = await updateJobs(current => {
        found = current.some(item => item.id === body.id);
        return current.map(item => item.id === body.id
          ? { ...item, ...body.patch, updatedAt: new Date().toISOString() }
          : item);
      });
      if (!found) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
      return NextResponse.json({ ok: true, jobs });
    }

    if (body.action === 'delete' && typeof body.id === 'string' && body.id) {
      let found = false;
      const jobs = await updateJobs(current => {
        found = current.some(item => item.id === body.id);
        return current.filter(item => item.id !== body.id);
      });
      if (!found) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
      return NextResponse.json({ ok: true, jobs });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    console.error('Job update failed safely', error);
    return NextResponse.json({ error: 'Could not safely update job storage. Please retry.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' }
    });
  }
}
"""

p = Path("app/api/discover/route.ts")
discover = p.read_text(encoding="utf-8")
if "import { readJobs, writeJobs, type Job } from '@/lib/store';" not in discover:
    sys.exit("STOP: unexpected discovery import; source files not changed.")
if "  const old=await readJobs();" not in discover:
    sys.exit("STOP: unexpected discovery read; source files not changed.")

pattern = re.compile(
    r"  const seen=new Set<string>\(\),unique=candidates\.filter\(j=>\{.*?\}\);\s*"
    r"  const existing=new Set\(old\.map\(j=>j\.id\)\),fresh=unique\.filter\(j=>!existing\.has\(j\.id\)\),merged=\[\.\.\.fresh,\.\.\.old\];\s*"
    r"  if\(fresh\.length\)await writeJobs\(merged\);",
    re.DOTALL
)

replacement = r"""  const seen=new Set<string>(),unique=candidates.filter(j=>{const k=j.sourceUrl!.toLowerCase().replace(/\/$/,'');if(seen.has(k))return false;seen.add(k);return true;});
  let fresh: Job[] = [];
  const merged = await updateJobs(current => {
    const existing = new Set(current.map(j => j.id));
    fresh = unique.filter(j => !existing.has(j.id));
    return fresh.length ? [...fresh, ...current] : current;
  });"""

patched, count = pattern.subn(replacement, discover, count=1)
if count != 1:
    sys.exit("STOP: could not safely match discovery merge; source files not changed.")

patched = patched.replace(
    "import { readJobs, writeJobs, type Job } from '@/lib/store';",
    "import { updateJobs, type Job } from '@/lib/store';",
    1
)
patched = patched.replace("  const old=await readJobs();\n", "", 1)

if "readJobs" in patched or "writeJobs" in patched:
    sys.exit("STOP: old storage references remain; source files not changed.")

Path("lib/store.ts").write_text(store, encoding="utf-8")
Path("app/api/jobs/route.ts").write_text(jobs_route, encoding="utf-8")
p.write_text(patched, encoding="utf-8")

print("PATCH APPLIED")
print("Updated storage and API routes.")
print("Local jobs and production Blob objects were not modified.")
print("Migration and deployment have not been performed.")
