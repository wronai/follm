#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if a command exists
command_exists() {
    command -v "$@" >/dev/null 2>&1
}

# Function to print status
print_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[OK]${NC} $1"
    else
        echo -e "${RED}[ERROR]${NC} $1"
        exit 1
    fi
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}This script requires root privileges. Please run with sudo.${NC}"
    exit 1
fi

echo -e "${GREEN}Starting Form Automation Setup...${NC}"

# 1. Install kubectl if not exists
if ! command_exists kubectl; then
    echo -e "${YELLOW}Installing kubectl...${NC}"
    chmod +x install-kubectl.sh
    ./install-kubectl.sh
    print_status "kubectl installation"
else
    echo -e "${GREEN}kubectl is already installed.${NC}"
fi

# 2. Install Minikube if not exists
if ! command_exists minikube; then
    echo -e "${YELLOW}Installing Minikube...${NC}"
    chmod +x install-minikube.sh
    ./install-minikube.sh
    print_status "Minikube installation"
else
    echo -e "${GREEN}Minikube is already installed.${NC}"
fi

# 3. Start Minikube cluster
echo -e "${YELLOW}Starting Minikube cluster...${NC}"
su - $SUDO_USER -c "minikube start --driver=docker --cpus=4 --memory=8192mb"
print_status "Minikube cluster started"

# 4. Enable required addons
echo -e "${YELLOW}Enabling Kubernetes addons...${NC}"
su - $SUDO_USER -c "minikube addons enable ingress"
su - $SUDO_USER -c "minikube addons enable metrics-server"
print_status "Kubernetes addons enabled"

# 5. Create namespace
echo -e "${YELLOW}Creating Kubernetes namespace...${NC}"
kubectl create namespace form-automation --dry-run=client -o yaml | kubectl apply -f -
kubectl label namespace form-automation name=form-automation --overwrite
print_status "Namespace created"

# 6. Create ConfigMap
echo -e "${YELLOW}Creating ConfigMap...${NC}"
kubectl apply -f k8s/configmap.yaml
print_status "ConfigMap created"

# 7. Create PostgreSQL resources
echo -e "${YELLOW}Setting up PostgreSQL...${NC}"
kubectl apply -f k8s/postgres.yaml
print_status "PostgreSQL setup complete"

# 8. Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=postgres -n form-automation --timeout=120s
print_status "PostgreSQL is ready"

# 9. Initialize database
echo -e "${YELLOW}Initializing database...${NC}"
kubectl cp postgres-init.sql form-automation/$(kubectl get pods -n form-automation -l app=postgres -o jsonpath='{.items[0].metadata.name}'):/tmp/init.sql
kubectl exec -n form-automation -it $(kubectl get pods -n form-automation -l app=postgres -o jsonpath='{.items[0].metadata.name}') -- psql -U formuser -d formdb -f /tmp/init.sql
print_status "Database initialized"

echo -e "\n${GREEN}Form Automation setup completed successfully!${NC}"
echo -e "${YELLOW}To access the application, run:${NC}"
echo -e "  kubectl port-forward svc/form-automation-service 3000:80 -n form-automation"
echo -e "\n${YELLOW}Then open http://localhost:3000 in your browser.${NC}"

echo -e "\n${YELLOW}To monitor the cluster, run:${NC}"
echo -e "  minikube dashboard"
