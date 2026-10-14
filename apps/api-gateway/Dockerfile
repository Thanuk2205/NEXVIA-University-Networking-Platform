FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
USER node
ENV PORT=5000
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api-gateway/src/server.js"]
