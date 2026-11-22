# Cloud Application with CI/CD Pipeline

Node.js (Express) dashboard, containerized with Docker, tested with Jest, and
deployed automatically by GitHub Actions on every push to `main`.

```
.
├── .github/workflows/ci-cd.yml   # pipeline
├── public/                       # dashboard (HTML + Tailwind CDN + JS)
├── tests/app.test.js             # Jest + Supertest
├── app.js  server.js  store.js   # app, entrypoint, persistence
├── Dockerfile  docker-compose.yml  .dockerignore
├── eslint.config.js  package.json  .env.example
```

## 1. Run locally
```bash
npm install          # also creates package-lock.json (commit it!)
npm run dev          # http://localhost:3000
```

## 2. Lint and test
```bash
npm run lint
npm test
npm run test:ci      # with coverage
```

## 3. Run with Docker
```bash
docker compose up --build -d
docker compose ps                  # STATUS should become "healthy"
curl localhost:3000/health
docker compose down                # data volume is kept; add -v to wipe it
```
Stamp build info into the image:
```bash
GIT_COMMIT=$(git rev-parse --short HEAD) BUILD_TIME=$(date -u +%FT%TZ) docker compose up --build -d
```

## 4. Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `DATA_DIR` | ./data (`/data` in Docker) | Where `db.json` is stored |
| `APP_ENV` | development | Shown on the dashboard |
| `GIT_COMMIT` | unknown | Set at build time (CI passes the commit SHA) |
| `BUILD_TIME` | unknown | Set at build time |

Only these keys are ever exposed by `/api/info`; secrets are never returned.

## 5. API
`GET /health` · `GET /api/info` · `GET|POST /api/counter[/increment|/reset]` ·
`GET|POST /api/messages` · `DELETE /api/messages/:id`

## 6. GitHub setup
1. Create a repo and push:
   ```bash
   git init && git add . && git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. **Settings → Actions → General → Workflow permissions**: *Read and write*.
3. Add secrets/variables (Settings → Secrets and variables → Actions):

**Option A: Render (default)**
- Render: *New → Web Service → Existing image* → `ghcr.io/<you>/<repo>:latest`
  (make the GHCR package public: Profile → Packages → package → Settings → Public).
  Set env `APP_ENV=production`, add a disk mounted at `/data`, health check path `/health`.
- Render service → Settings → **Deploy Hook** → copy URL.
- GitHub secret `RENDER_DEPLOY_HOOK_URL` = that URL.
- Optional repo variable `APP_URL` = `https://your-app.onrender.com` (enables smoke test).

**Option B: AWS EC2**
- Launch an Ubuntu EC2 instance, open ports 22 and 80, install Docker
  (`sudo apt update && sudo apt install -y docker.io && sudo usermod -aG docker ubuntu`).
- GitHub secrets: `EC2_HOST` (public IP/DNS), `EC2_USER` (e.g. `ubuntu`),
  `EC2_SSH_KEY` (full private key text).
- GitHub repo **variable** `DEPLOY_TARGET` = `ec2`.

Optional: create an environment named `production` (Settings → Environments)
and add required reviewers for manual approval before deploys.

## 7. Pipeline stages
| Stage | Job | Runs on |
|---|---|---|
| 1-2 Checkout, setup, install, lint | `lint` | push + PR |
| 3 Unit/integration tests (fails pipeline on error) | `test` | push + PR |
| 4 Build & push image to GHCR | `build-push` | push to main |
| 5 Deploy (Render hook or EC2 SSH) | `deploy-render` / `deploy-ec2` | push to main |

Pull requests run stages 1-3 only; images are pushed and deployed only after a merge to `main`.

## 8. Monitor the pipeline
- GitHub repo → **Actions** tab → *CI/CD Pipeline* → click a run to see each job's logs.
- Failed job: open it, expand the red step, fix, push again.
- Coverage report: run page → *Artifacts* → `coverage`.
- Images: repo sidebar → **Packages**.
- Deployed app: open the URL; the dashboard shows the new commit hash and version.
- Add a status badge:
  `![CI/CD](https://github.com/<you>/<repo>/actions/workflows/ci-cd.yml/badge.svg)`

## 9. Troubleshooting
- `npm ci` fails in CI/Docker → `package-lock.json` is missing; run `npm install` and commit it.
- Push to GHCR denied → workflow permissions must be *Read and write*.
- Render can't pull image → make the GHCR package public or add registry credentials in Render.
- Port 80 on EC2 unreachable → check the security group inbound rules.
