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

echo -e "${GREEN}Starting kubectl installation...${NC}"

# Detect Linux distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
else
    echo -e "${RED}Could not detect Linux distribution.${NC}"
    exit 1
fi

# Install required dependencies
echo -e "${GREEN}Installing required dependencies...${NC}"
if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    apt-get update
    apt-get install -y apt-transport-https ca-certificates curl
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
    yum install -y yum-utils
else
    echo -e "${RED}Unsupported Linux distribution: $OS${NC}"
    exit 1
fi

# Download and install kubectl
echo -e "${GREEN}Installing kubectl...${NC}"

# Download the latest stable version of kubectl
KUBECTL_VERSION=$(curl -L -s https://dl.k8s.io/release/stable.txt)
echo -e "${YELLOW}Downloading kubectl version: $KUBECTL_VERSION${NC}"

# Download kubectl binary
curl -LO "https://dl.k8s.io/release/$KUBECTL_VERSION/bin/linux/amd64/kubectl"

# Download kubectl checksum
curl -LO "https://dl.k8s.io/$KUBECTL_VERSION/bin/linux/amd64/kubectl.sha256"

# Verify the checksum
echo -e "${GREEN}Verifying kubectl checksum...${NC}"
if ! echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check; then
    echo -e "${RED}Checksum verification failed!${NC}"
    exit 1
fi

# Install kubectl
install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Clean up
rm -f kubectl kubectl.sha256

# Install bash completion
echo -e "${GREEN}Setting up bash completion...${NC}"
mkdir -p /etc/bash_completion.d
kubectl completion bash > /etc/bash_completion.d/kubectl

# Install krew (kubectl plugin manager)
echo -e "${GREEN}Installing krew (kubectl plugin manager)...${NC}"
(
  set -x; cd "$(mktemp -d)" &&
  OS="$(uname | tr '[:upper:]' '[:lower:]')" &&
  ARCH="$(uname -m | sed -e 's/x86_64/amd64/' -e 's/\(arm\)\([^\/]\)*/\l\1\2/' -e 's/aarch64$/arm64/')" &&
  KREW="krew-${OS}_${ARCH}" &&
  curl -fsSLO "https://github.com/kubernetes-sigs/krew/releases/latest/download/${KREW}.tar.gz" &&
  tar zxvf "${KREW}.tar.gz" &&
  ./"${KREW}" install krew
)

echo -e "\n${GREEN}Installation completed successfully!${NC}"
echo -e "${YELLOW}To start using kubectl, you may need to restart your shell or run:${NC}"
echo -e "  source <(kubectl completion bash)"
echo -e "\n${YELLOW}To verify the installation, run:${NC}"
echo -e "  kubectl version --client"

# Add krew to PATH if not already in .bashrc
if ! grep -q 'export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"' ~/.bashrc; then
    echo 'export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"' >> ~/.bashrc
    echo -e "${YELLOW}Added krew to PATH in ~/.bashrc${NC}"
fi

echo -e "\n${GREEN}Please log out and log back in to update your PATH with krew.${NC}"
