FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN chmod +x docker/entrypoint.sh
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["sh", "docker/entrypoint.sh"]
