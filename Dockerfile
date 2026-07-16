FROM node:20-alpine

WORKDIR /app

COPY worker/package*.json ./worker/
RUN cd worker && npm install --omit=dev

COPY worker/server.js ./worker/server.js
COPY worker/src ./worker/src
COPY dist ./dist
COPY modules ./modules
COPY wloc.jpg ./wloc.jpg

WORKDIR /app/worker

ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787

CMD ["npm", "start"]
