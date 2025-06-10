# Form Automation - Enterprise Edition

An advanced, self-healing form automation solution built with Kubernetes, supporting multi-modal form filling with AI assistance.

## Features

- **Self-healing** - Automatically recovers from common failures
- **Multi-modal** - Supports visual and DOM-based form analysis
- **Scalable** - Kubernetes-native design for horizontal scaling
- **Persistent Storage** - PostgreSQL for data persistence
- **Monitoring** - Built-in metrics and health checks

## Prerequisites

- Linux/macOS (Windows requires WSL2)
- 8GB+ RAM
- 4+ CPU cores
- 20GB+ free disk space
- Docker installed

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd follm/3
   ```

2. **Make the setup script executable**
   ```bash
   chmod +x setup.sh install-*.sh
   ```

3. **Run the setup script** (requires sudo)
   ```bash
   sudo ./setup.sh
   ```
   This will:
   - Install kubectl if not present
   - Install and configure Minikube
   - Set up the Kubernetes cluster
   - Deploy all required services
   - Initialize the database

4. **Access the application**
   ```bash
   # Port-forward the service
   kubectl port-forward svc/form-automation-service 3000:80 -n form-automation
   ```
   Then open http://localhost:3000 in your browser.

## Usage

### Submit a Form Automation Job

```bash
curl -X POST http://localhost:3000/v2/automate-form \
  -F "url=<target-form-url>" \
  -F "firstName=John" \
  -F "lastName=Doe" \
  -F "email=john.doe@example.com" \
  -F "phone=+1234567890" \
  -F "resume=@/path/to/resume.pdf"
```

### Check Job Status

```bash
# List all jobs
kubectl get jobs -n form-automation

# View job logs
kubectl logs -f <pod-name> -n form-automation

# Get job details
curl http://localhost:3000/v2/jobs/<job-id>/status
```

### Scaling

```bash
# Scale up the application
kubectl scale deployment form-automation --replicas=5 -n form-automation

# Check deployment status
kubectl get deployments -n form-automation
```

## Monitoring

### Access Kubernetes Dashboard
```bash
minikube dashboard
```

### View Application Metrics
```bash
kubectl port-forward svc/form-automation-metrics 9100:9100 -n form-automation
```
Then access metrics at http://localhost:9100/metrics

## Troubleshooting

### Common Issues

1. **Minikube not starting**
   ```bash
   # Check minikube status
   minikube status
   
   # View logs
   minikube logs
   
   # Reset minikube (if needed)
   minikube delete
   minikube start
   ```

2. **Pods not starting**
   ```bash
   # Check pod status
   kubectl get pods -n form-automation
   
   # View pod logs
   kubectl logs <pod-name> -n form-automation
   
   # Describe pod for more details
   kubectl describe pod <pod-name> -n form-automation
   ```

3. **Database connection issues**
   ```bash
   # Check PostgreSQL status
   kubectl exec -it <postgres-pod> -n form-automation -- psql -U formuser -d formdb
   
   # View database logs
   kubectl logs <postgres-pod> -n form-automation
   ```

## Maintenance

### Backup Database
```bash
kubectl exec -n form-automation <postgres-pod> -- pg_dump -U formuser formdb > formdb_backup_$(date +%Y%m%d).sql
```

### Update Application
```bash
# Apply new configuration
kubectl apply -f k8s/

# Restart deployments
kubectl rollout restart deployment -n form-automation
```

## License

This project is licensed under the MIT License.
  -F "email=sarah.chen@example.com" \
  -F "position=senior-developer" \
  -F "cv=@resume.pdf" \
  -F "config.strategy=adaptive" \
  -F "config.selfHealing=true"

# Monitoring metryk
curl http://localhost:3000/metrics
```

---

## Podsumowanie Rozwiązań

### Porównanie Funkcjonalności

| Funkcja | Minimal MVP | Production Ready | Enterprise Advanced |
|---------|-------------|------------------|-------------------|
| **Czas wdrożenia** | 15 min | 45 min | 2 godz |
| **Autonomia** | 70% | 85% | 95% |
| **Skalowanie** | Brak | Średnie | Pełne |
| **Self-healing** | ❌ | ✅ | ✅✅ |
| **Monitoring** | ❌ | ✅ | ✅✅ |
| **Multi-modal AI** | ❌ | ❌ | ✅ |
| **Visual verification** | ❌ | ✅ | ✅✅ |
| **Batch processing** | ❌ | ❌ | ✅ |
| **Enterprise security** |