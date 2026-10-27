FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p data && chown node:node data
USER node
CMD ["npm", "start"]
