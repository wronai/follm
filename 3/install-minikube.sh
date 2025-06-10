#!/bin/bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}This script requires root privileges. Please run with sudo.${NC}"
    exit 1
fi

# Install kubectl if not already installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${YELLOW}kubectl not found. Installing kubectl first...${NC}"
    ./install-kubectl.sh
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install kubectl. Please install it manually first.${NC}"
        exit 1
    fi
fi

# Install Minikube
echo -e "${GREEN}Installing Minikube...${NC}"

# Download Minikube
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64

# Install Minikube
install minikube-linux-amd64 /usr/local/bin/minikube

# Clean up
rm minikube-linux-amd64

# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker not found. Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    
    # Add current user to docker group
    usermod -aG docker $SUDO_USER
    
    echo -e "${YELLOW}Docker installed. Please log out and log back in for the group changes to take effect.${NC}"
    exit 0
fi

# Start Minikube
echo -e "${GREEN}Starting Minikube...${NC}"
su - $SUDO_USER -c "minikube start --driver=docker --cpus=4 --memory=8192mb"

# Verify installation
echo -e "${GREEN}Verifying installation...${NC}"
su - $SUDO_USER -c "kubectl get pods -A"

# Enable ingress
echo -e "${GREEN}Enabling ingress...${NC}"
su - $SUDO_USER -c "minikube addons enable ingress"

# Install metrics server
echo -e "${GREEN}Installing metrics server...${NC}"
su - $SUDO_USER -c "minikube addons enable metrics-server"

echo -e "\n${GREEN}Minikube installation completed successfully!${NC}"
echo -e "${YELLOW}To start using Minikube, run:${NC}"
echo -e "  minikube start"
echo -e "\n${YELLOW}To access the Kubernetes dashboard, run:${NC}"
echo -e "  minikube dashboard"

echo -e "${GREEN}After installation, you can deploy the application using:${NC}"
echo -e "  kubectl apply -f k8s/"
