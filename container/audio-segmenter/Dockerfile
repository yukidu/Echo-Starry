FROM node:22-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY container/audio-segmenter/server.mjs /app/server.mjs

EXPOSE 8080
CMD ["node", "/app/server.mjs"]
