# vCluster Deployment (from Git)

This setup deploys the app to Kubernetes/vCluster using:

- Image from GHCR: `ghcr.io/anuj-astrellix/ai-language-editing:latest`
- Persistent volume mounted at `/app/storage`
- Single replica (required for current in-memory queue behavior)

## 1) Connect to your vCluster context

Use your normal vCluster connect flow, then verify:

```bash
kubectl config current-context
kubectl get nodes
```

## 2) Create secret (do not commit real keys)

```bash
kubectl create namespace ai-language-editor --dry-run=client -o yaml | kubectl apply -f -
kubectl -n ai-language-editor create secret generic ai-language-editor-secrets \
  --from-literal=OPENAI_API_KEY='sk-REPLACE_ME' \
  --from-literal=DATABASE_URL='' \
  --dry-run=client -o yaml | kubectl apply -f -
```

## 3) Deploy from Git (kustomize remote)

```bash
kubectl apply -k 'https://github.com/anuj-astrellix/AI-Language-Editing//deploy/vcluster?ref=main'
```

## 4) Access

### Option A: port-forward (fastest)

```bash
kubectl -n ai-language-editor port-forward svc/ai-language-editor 3000:80
```

Open `http://localhost:3000`.

### Option B: ingress

Update host in `ingress.yaml` before apply:

- `ai-language-editor.example.com` -> your real domain

Then point DNS to your ingress controller.

## 5) Update rollout when new git image is published

After pushing to `main` and image publish completes:

```bash
kubectl -n ai-language-editor rollout restart deployment/ai-language-editor
kubectl -n ai-language-editor rollout status deployment/ai-language-editor
```

## Notes

- Current app uses filesystem storage + in-memory queue, so keep `replicas: 1`.
- For horizontal scale, migrate queue to Redis and storage to object storage + DB.
