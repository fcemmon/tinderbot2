docker container run -it \
    --rm \
    --tty  \
    --network host \
    --privileged \
    --mount type=bind,source="$(pwd)",target=/home/user/tbot \
    --mount type=bind,source="$(pwd)/logs",target=/var/log \
    --mount type=bind,source="$(pwd)/entrypoint.sh",target=/entrypoint.sh \
    --shm-size=2000m \
    -e DB_HOST=172.17.0.1 \
    -e DB_USER=bijan \
    -e DB_PASSWORD=lkj3lkj3 \
    -e DB_URL=postgresql://bijan:lkj3lkj3@172.17.0.1/tinderbot_prod \
    registry.localhost:5000/docker-vnc-xfce4:latest \
    $1
    # -e DB_HOST=host.docker.internal \
    # -p 6080:6080 \
    # -p 5900:5900 \
