#!/bin/bash

# Get the name of a form-automation pod
POD_NAME=$(kubectl get pods -n form-automation -l app=form-automation -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POD_NAME" ]; then
  echo "No form-automation pod found"
  exit 1
fi

echo "Inspecting pod: $POD_NAME"
echo "-------------------------------"
kubectl describe pod -n form-automation $POD_NAME

echo -e "\nContainer logs:"
echo "-------------------------------"
kubectl logs -n form-automation $POD_NAME

echo -e "\nFiles in /app:"
echo "-------------------------------"
kubectl exec -n form-automation $POD_NAME -- ls -la /app

echo -e "\nPackage.json contents:"
echo "-------------------------------"
kubectl exec -n form-automation $POD_NAME -- cat /app/package.json 2>/dev/null || echo "package.json not found"

echo -e "\nEnvironment variables:"
echo "-------------------------------"
kubectl exec -n form-automation $POD_NAME -- env
