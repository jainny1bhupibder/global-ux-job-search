# Global UX Job Search — Local Run Package

This is a standalone local version of the reconstructed Global UX Job Search app. It includes the discovery fix, per-feed diagnostics, and a local JSON store so you can run it without Vercel Blob.

## Requirements
- Node.js 20 or newer
- npm

## Start
1. Extract the ZIP.
2. Open Terminal in the extracted `global-ux-job-search-local` folder.
3. Run:

```bash
npm install
npm run dev
```

4. Open http://localhost:3000

The app uses local file storage at `data/jobs.json`. The file is created automatically. Back it up before replacing code in an existing project.

## Production build

```bash
npm run build
npm start
```

## Notes
- This package is self-contained and does not contain your Vercel environment variables or any saved cloud jobs.
- It starts with an empty local data file; it does not import, delete, or change your cloud data.
- Remote job feeds can change or be unavailable. Results include per-feed diagnostics.
- Job descriptions and links come from third-party feeds; verify each listing on the employer's official application page.
# global-ux-job-search
# global-ux-job-search
