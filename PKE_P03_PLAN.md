# PKE_P03_PLAN — Perbaikan Vercel Serverless ESM/CJS Conflict

## Tanggal dan waktu pekerjaan
- 2026-11-16 (mulai dan selesai validasi lokal pada tanggal yang sama)

## Root cause yang dibuktikan
- Root `package.json` menetapkan `"type": "module"` → seluruh `.js` di ruang paket root dimuat Node.js sebagai **ES Module**.
- `api/tsconfig.json` menetapkan `"module": "commonjs"` → hasil kompilasi/bundling API menggunakan sintaks CommonJS (`module.exports`, `require`).
- `vercel.json` menggunakan builder `@vercel/node` dengan entri `api/[...path].ts`. File API hasil bundling dijalankan sebagai `.js` dalam ruang paket **ES Module**.
- Akibat: runtime Node.js Vercel melempar `ReferenceError: exports is not defined in ES module scope` dan `FUNCTION_INVOCATION_FAILED` pada `/api/v1/me` dan `/api/v1/projects`.
- Bukti simulasi bundling (esbuild `--format=esm --platform=node` sebelum perbaikan gagal / sesudah perbaikan berhasil): artefak yang di-Bundler ESM menggunakan `export { handler as default }`, tanpa `module.exports` maupun `require(` di top-level.

## File yang diperiksa
1. `package.json` — `"type": "module"`, TypeScript 7.0.2, esbuild 0.28.2 tersedia.
2. `tsconfig.json` — root, `module: commonjs`, `rootDir: ./src`, mencakup hanya `src/**`.
3. `api/tsconfig.json` — `module: commonjs` (SEBELUM), tanpa `moduleResolution`.
4. `api/[...path].ts` — entri serverless, `import app, { ensureRuntimeReady } from "../src/index"`, `export default async function handler`.
5. `src/index.ts` — `export const app` (line 50), `export default app` (line 3641), import `preflight.mjs` dengan `@ts-expect-error`.
6. `src/integration/integration.test.ts` — import `preflight.mjs` dengan `@ts-expect-error`.
7. `vercel.json` — `@vercel/node` builder untuk `api/[...path].ts`.
8. `frontend/tsconfig.json` — pola referensi yang sudah benar: `module: ESNext`, `moduleResolution: Bundler`.
9. `frontend/package.json` — skrip `typecheck` dan `build`.

## File yang diubah
1. `api/tsconfig.json` — `module` diubah `commonjs` → `ESNext`; ditambahkan `moduleResolution: "Bundler"`.
2. `src/index.ts` — dihapus `// @ts-expect-error` pada impor `preflight.mjs` (directive tidak lagi terpakai karena `moduleResolution: Bundler` tidak menandai impor `.mjs`).
3. `src/integration/integration.test.ts` — dihapus `// @ts-expect-error` pada impor `preflight.mjs` (alasan sama).

## Detail konfigurasi sebelum dan sesudah

### `api/tsconfig.json` SEBELUM
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": false,
    "allowImportingTsExtensions": true,
    "types": ["node"]
  },
  "include": ["./**/*.ts", "../src/**/*.ts"]
}
```

### `api/tsconfig.json` SESUDAH
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": false,
    "allowImportingTsExtensions": true,
    "types": ["node"]
  },
  "include": ["./**/*.ts", "../src/**/*.ts"]
}
```

Keputusan teknis:
- `module: "ESNext"` didukung TypeScript 7.0.2 dan menghasilkan output ESM (`import`/`export`).
- `moduleResolution: "Bundler"` menyerahkan resolusi modul ke bundler (esbuild Vercel), konsisten dengan pola yang sudah digunakan `frontend/tsconfig.json`.
- Root `"type": "module"` sengaja TIDAK diubah ke CommonJS (larasan aturan keselamatan).
- Tidak ada perubahan implementasi autentikasi atau SQL.
- Entrypoint tetap mengekspor `handler` sebagai default (Vercel mengenali default export), melalui `src/index.ts` yang sudah mempunyai `export default app` (line 3641).

## Hasil setiap validasi

| Validasi | Perintah | Hasil | Bukti |
|----------|----------|-------|-------|
| Backend typecheck | `npx tsc -p api/tsconfig.json --noEmit` | PASS | exit code 0, tanpa error |
| Frontend typecheck | `cd frontend && npm run typecheck` | PASS | exit code 0, `tsc --noEmit` lolos |
| Frontend production build | `cd frontend && npm run build` | PASS | exit code 0, `vite build` selesai 10.64s, `dist/` dihasilkan |
| Backend runtime/security test | `npm test` (vitest `src/runtime-security.test.ts`) | PASS | 1 test file, 5 tests passed, 792ms |
| Vercel bundling simulasi | `npx esbuild api/[...path].ts --bundle --format=esm --platform=node` | PASS | artefak: `export { handler as default }`, 0 top-level `module.exports`, 0 top-level `require(` |

Keterbatasan: Vercel CLI tidak terpasang secara lokal, sehingga build aktual `@vercel/node` tidak dapat dijalankan. Simulasi esbuild adalah mekanisme bundler yang sedekat mungkin yang tersedia secara lokal. Tidak ada klaim bahwa validasi Vercel sudah lulus; deployment memerlukan persetujuan operator dan bukti dari Vercel.

## Bukti build dan bundling
- Artefak esbuild (sudah dibersihkan dari workspace): `.kilo-tmp/api-bundle.mjs` (53.447 baris).
- Entrypoint diekspor sebagai ESM default: `export { handler as default };`.
- Tidak ada output CommonJS `module.exports` atau `require(` pada top-level artefak.
- Frontend build artifacts di `frontend/dist/` (`index.html`, `assets/index-*.js`, `assets/index-*.css`).

## Status deployment
- NOT STARTED. Belum ada deployment ke Vercel. Persyaratan: validasi lokal telah selesai (PASS semua), menunggu persetujuan operator sebelum deployment.
- Belum ada bukti deployment dari Vercel. Production Ready TIDAK ditandai hanya karena error modul telah diperbaiki.

## Blocker yang masih ada
- Tidak ada Vercel CLI secara lokal untuk mereplikasi bundling `@vercel/node` secara akurat; simulasi esbuild digunakan sebagai pendekatan terdekat.
- Verifikasi post-deployment (`/api/v1/health`, `/api/v1/me`, `/api/v1/projects`, penolakan tanpa token, non-admin tanpa akses admin, RLS) belum dilakukan karena belum ada deployment.

## Keputusan teknis dan tindak lanjut
1. Terapkan `module: "ESNext"` + `moduleResolution: "Bundler"` pada `api/tsconfig.json` (DONE).
2. Hapus `@ts-expect-error` yang tidak terpakai akibat resolusi Bundler (DONE).
3. Deployment ke Vercel dilakukan setelah persetujuan operator, lalu verifikasi endpoint dan keamanan runtime.
4. Jika Vercel build tetap gagal, investigasi konfigurasi `@vercel/node` builder (builds/overrides) sebagai langkah selanjutnya.
5. Tandai Production Ready hanya setelah bukti deployment Vercel dan verifikasi post-deployment berhasil.

---

## Vercel ESM Remediation - 20261116_174008

### Changes
- Replaced legacy Vercel builds configuration with modern outputDirectory configuration.
- Set frontend output directory to frontend/dist.
- Routed API requests under /api/v1 to the existing catch-all API function.
- Kept API TypeScript module configuration at ESNext with Bundler resolution.
- No Neon or database operations were executed.
- No Git commit or push was performed.

### Validation
- vercel.json JSON parsing: PASS
- API TypeScript ESM configuration: PASS
- API TypeScript check: PASS
- Frontend typecheck: PASS
- Test suite: PASS
- Frontend production build: PASS
- frontend/dist/index.html: PASS

### Deployment status
LOCAL VALIDATION ONLY.
Vercel deployment has not been triggered or verified.

### Remaining verification
- Verify the deployed Vercel build and runtime.
- Verify /api/v1/me and /api/v1/projects after deployment.
- Verify dashboard access using the existing authorized account.

