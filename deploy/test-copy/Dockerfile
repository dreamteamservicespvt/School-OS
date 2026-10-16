# School OS test copy: the whole app in one container (web, worker, database
# and the PDF browser), loaded with the demo school. Made for a free
# Hugging Face Docker Space, but runs anywhere Docker runs:
#   docker build -t school-os-test deploy/test-copy
#   docker run -p 7860:7860 school-os-test
#
# The database lives inside the container, so every restart starts again
# from a fresh demo school. Never use this for a real school's data.
FROM node:22-bookworm AS node

FROM postgres:16-bookworm
COPY --from=node /usr/local /usr/local

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates chromium fonts-noto-core fonts-noto-ui-core \
 && rm -rf /var/lib/apt/lists/*

# Hugging Face runs the container as user 1000.
RUN useradd -m -u 1000 user
USER user
WORKDIR /home/user

ARG REPO=https://github.com/dreamteamservicespvt/school-os.git
ARG BRANCH=claude/project-thread-lgo7ny
RUN git clone --depth 1 --branch "$BRANCH" "$REPO" app
WORKDIR /home/user/app
RUN npm ci --no-audit --no-fund
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

ENV CHROMIUM_PATH=/usr/bin/chromium \
    STORAGE_DIR=/home/user/files \
    PORT=7860
EXPOSE 7860
CMD ["bash", "deploy/test-copy/start.sh"]
