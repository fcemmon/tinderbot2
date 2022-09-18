#!/bin/bash
set -eu

# build
docker build .                \
  --file Dockerfile           \
  --tag registry.localhost:5000/docker-vnc-xfce4:latest      \
  --build-arg TZ=Mexico/Mexico

# push
docker push registry.localhost:5000/docker-vnc-xfce4:latest
