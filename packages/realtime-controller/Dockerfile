FROM public.ecr.aws/docker/library/node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY packages/realtime-controller/package*.json ./packages/realtime-controller/
COPY packages/realtime-controller/tsconfig.json ./packages/realtime-controller/
COPY packages/realtime-controller/src ./packages/realtime-controller/src

WORKDIR /app/packages/realtime-controller
RUN npm install
RUN npm run build

EXPOSE 8081
CMD ["node", "dist/index.js"]

