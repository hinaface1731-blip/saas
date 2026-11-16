FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY package.json server.mjs db.mjs billing.mjs ./
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
