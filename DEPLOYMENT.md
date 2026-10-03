# ☁️ SysLab: Cloud & Production Deployment Guide

SysLab is engineered with **Zero-Dependency In-Memory Defaults** for instant local development, coupled with **Cloud-Native 12-Factor Architecture** ready for deployment to any major cloud provider (AWS, GCP, Kubernetes, Docker, Render, Fly.io).

---

## 🏃 1. Local Machine (Zero-Config, Instant Startup)

```bash
# Clone and install dependencies
npm install

# Start the application locally
npm start

# Access the workbench in your browser
http://localhost:3000
```

---

## 🐳 2. Docker & Docker Compose (Containerized Architecture)

SysLab includes a multi-stage `Dockerfile` (Node 22 Alpine, non-root user, built-in `/healthz` probe) and a `docker-compose.yml` orchestrating both the application and a Redis backplane.

```bash
# Build and run the complete stack with Redis
docker-compose up -d --build

# Check running container health
docker-compose ps

# View live container logs
docker-compose logs -f syslab-app

# Stop the stack
docker-compose down
```

---

## ☸️ 3. Kubernetes Deployment (Production Scale)

All Kubernetes manifests are located in the [`k8s/`](file:///d:/testing%20the%20project/k8s) directory:

```bash
# 1. Apply Persistent Volume Claim for S3 storage chunks
kubectl apply -f k8s/service.yaml

# 2. Deploy 3 auto-recovering pod replicas with rolling updates & health probes
kubectl apply -f k8s/deployment.yaml

# 3. Enable Horizontal Pod Autoscaling (scales pods 2 -> 10 based on CPU/RAM load)
kubectl apply -f k8s/hpa.yaml

# Check deployment status
kubectl get pods -l app=syslab
kubectl get svc syslab-service
```

---

## ☁️ 4. Google Cloud Run (Serverless Container)

```bash
# 1. Build and push container to Google Artifact Registry
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/syslab-platform

# 2. Deploy to Cloud Run with automatic SSL and auto-scaling
gcloud run deploy syslab-platform \
  --image gcr.io/YOUR_PROJECT_ID/syslab-platform \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --cpu 1
```

---

## 🚀 5. 1-Click Platform-as-a-Service (Render & Fly.io)

### Render.com (Blueprint)
The included [`render.yaml`](file:///d:/testing%20the%20project/render.yaml) automatically provisions:
- Node.js web service with persistent 10GB SSD disk mount
- Automated health check probe pointing to `/healthz`
- Free HTTPS/SSL certificate

### Fly.io (Global Edge Deploy)
```bash
# Launch on Fly.io using included fly.toml configuration
fly launch --no-deploy
fly deploy
```

---

## 🛡️ Production Health & Monitoring Probes

| Endpoint | Method | Purpose | Cloud Use Case |
|---|---|---|---|
| `/healthz` | `GET` | Container Liveness & Readiness probe | Kubernetes Kubelet, AWS ALB, GCP Load Balancer |
| `/api/health` | `GET` | Detailed process memory & uptime metrics | Datadog, Prometheus, New Relic monitoring |
| `/api/system/overview` | `GET` | Cross-module distributed telemetry | Grafana & SysLab ArchitectOS Dashboard |

---

## ⚙️ Environment Variables Reference

| Variable | Default Value | Description |
|---|---|---|
| `PORT` | `3000` | Port for the HTTP and WebSocket server. |
| `HOST` | `0.0.0.0` | Host IP address binding (required for container ingress). |
| `NODE_ENV` | `production` | Node environment (`development` / `production`). |
| `STORAGE_DATA_DIR` | `./server/data/storage_nodes` | Directory for chunked object storage (mount to persistent volume in cloud). |
| `REDIS_URL` | `redis://localhost:6379` | Optional Redis URL for multi-pod distributed state sharing. |
