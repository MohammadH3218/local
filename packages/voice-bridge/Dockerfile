# Multi-stage Dockerfile for HandyCall Voice Bridge (Twilio Media Streams)

FROM public.ecr.aws/docker/library/node:20-bookworm-slim AS builder

WORKDIR /app

COPY tsconfig.json ./tsconfig.json

COPY packages/voice-bridge/package*.json ./packages/voice-bridge/
COPY packages/voice-bridge/tsconfig.json ./packages/voice-bridge/tsconfig.json
COPY packages/voice-bridge/src ./packages/voice-bridge/src

WORKDIR /app/packages/voice-bridge
RUN npm install
RUN npm run build

FROM public.ecr.aws/docker/library/node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/packages/voice-bridge/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/packages/voice-bridge/dist ./dist

EXPOSE 8080
CMD ["node", "dist/minimal.js"]
