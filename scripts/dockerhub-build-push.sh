#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Build and push Limor Automations images to DockerHub.

Usage:
  scripts/dockerhub-build-push.sh [--user <dockerhub_user>] [--tag <tag>] [--latest] [--multiarch]

Options:
  --user <dockerhub_user>  DockerHub namespace (default: theonlyartz)
  --tag <tag>              Image tag (default: git short SHA)
  --latest                 Also tag and push :latest
  --multiarch              Use buildx to push linux/amd64 + linux/arm64

Examples:
  scripts/dockerhub-build-push.sh
  scripts/dockerhub-build-push.sh --tag 06d409e --latest
  scripts/dockerhub-build-push.sh --multiarch --latest
EOF
}

USER_NAME="theonlyartz"
TAG=""
PUSH_LATEST=0
MULTIARCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      USER_NAME="${2:-}"
      shift 2
      ;;
    --tag)
      TAG="${2:-}"
      shift 2
      ;;
    --latest)
      PUSH_LATEST=1
      shift
      ;;
    --multiarch)
      MULTIARCH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$USER_NAME" ]]; then
  echo "Missing --user" >&2
  exit 1
fi

if [[ -z "$TAG" ]]; then
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    TAG="$(git rev-parse --short HEAD)"
  else
    echo "No --tag provided and git not available" >&2
    exit 1
  fi
fi

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker not found in PATH" >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon not reachable. Is Docker running?" >&2
    exit 1
  fi
}

require_docker

echo "Using DockerHub user: $USER_NAME"
echo "Using tag: $TAG"
if [[ "$PUSH_LATEST" -eq 1 ]]; then echo "Also pushing :latest"; fi
if [[ "$MULTIARCH" -eq 1 ]]; then echo "Multi-arch: linux/amd64,linux/arm64"; fi

build_and_push_single() {
  local name="$1"
  local target="$2"
  local image="$USER_NAME/$name:$TAG"

  echo
  echo "==> Building $image (target=$target)"
  docker build --target "$target" -t "$image" .

  echo "==> Pushing $image"
  docker push "$image"

  if [[ "$PUSH_LATEST" -eq 1 ]]; then
    local latest="$USER_NAME/$name:latest"
    echo "==> Tagging $latest"
    docker tag "$image" "$latest"
    echo "==> Pushing $latest"
    docker push "$latest"
  fi
}

build_and_push_multi() {
  local name="$1"
  local target="$2"
  local image="$USER_NAME/$name:$TAG"

  echo
  echo "==> buildx pushing $image (target=$target)"

  if ! docker buildx inspect limor-builder >/dev/null 2>&1; then
    docker buildx create --name limor-builder --use >/dev/null
  else
    docker buildx use limor-builder >/dev/null
  fi

  local tags=("-t" "$image")
  if [[ "$PUSH_LATEST" -eq 1 ]]; then
    tags+=("-t" "$USER_NAME/$name:latest")
  fi

  docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --target "$target" \
    "${tags[@]}" \
    --push \
    .
}

if [[ "$MULTIARCH" -eq 1 ]]; then
  build_and_push_multi limor-api api
  build_and_push_multi limor-webhooks webhooks
  build_and_push_multi limor-worker worker
  build_and_push_multi limor-web web
else
  build_and_push_single limor-api api
  build_and_push_single limor-webhooks webhooks
  build_and_push_single limor-worker worker
  build_and_push_single limor-web web
fi

echo
echo "Done."
