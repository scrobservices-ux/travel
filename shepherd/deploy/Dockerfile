# Shepherd — no dependencies, so this is about as small as a Node image gets.
FROM node:20-alpine

RUN addgroup -S shepherd && adduser -S shepherd -G shepherd
WORKDIR /app
COPY --chown=shepherd:shepherd . /app
RUN rm -rf /app/server/data /app/test /app/deploy && mkdir -p /app/server/data \
    && chown -R shepherd:shepherd /app/server/data

USER shepherd
ENV PORT=8080 HOST=0.0.0.0 TRUST_PROXY=1
EXPOSE 8080
VOLUME ["/app/server/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1

CMD ["node", "server/server.js"]
