FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_CHART_ENGINE
ENV VITE_CHART_ENGINE=$VITE_CHART_ENGINE
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
# Build output is exported to the shared volume at container start (see compose.yml)
CMD ["sh", "-c", "rm -rf /dist/* && cp -r /app/dist/. /dist/"]
