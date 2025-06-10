#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[OK]${NC} $1"
    else
        echo -e "${RED}[ERROR]${NC} $1"
        exit 1
    fi
}

echo -e "${GREEN}Continuing Form Automation Setup...${NC}"

# 1. Create ConfigMap
echo -e "${YELLOW}Creating ConfigMap...${NC}"
kubectl apply -f k8s/configmap.yaml -n form-automation
print_status "ConfigMap created"

# 2. Create PostgreSQL resources
echo -e "${YELLOW}Setting up PostgreSQL...${NC}"
kubectl apply -f k8s/postgres.yaml -n form-automation
print_status "PostgreSQL setup complete"

# 3. Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=postgres -n form-automation --timeout=120s
print_status "PostgreSQL is ready"

# 4. Initialize database
echo -e "${YELLOW}Initializing database...${NC}"
kubectl cp postgres-init.sql form-automation/$(kubectl get pods -n form-automation -l app=postgres -o jsonpath='{.items[0].metadata.name}'):/tmp/init.sql
kubectl exec -n form-automation -it $(kubectl get pods -n form-automation -l app=postgres -o jsonpath='{.items[0].metadata.name}') -- psql -U formuser -d formdb -f /tmp/init.sql
print_status "Database initialized"

echo -e "\n${GREEN}Form Automation setup completed successfully!${NC}"
echo -e "${YELLOW}To access the application, run:${NC}"
echo -e "  kubectl port-forward svc/form-automation-service 3000:80 -n form-automation"
echo -e "\n${YELLOW}Then open http://localhost:3000 in your browser.${NC}"
