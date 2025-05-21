#! /bin/bash
IMAGE_NAME=${1}
if [ -z "$IMAGE_NAME" ]; then
    echo "Usage: $0 <image_name>"
    exit 1
fi

docker build -t "$IMAGE_NAME" .
if [ $? -ne 0 ]; then
    echo "Failed to build the Docker image."
    exit 1
fi
echo "Built image $IMAGE_NAME"