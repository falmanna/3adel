FROM directus/directus:11.10.2 AS base

USER root
RUN corepack enable
USER node

RUN pnpm install directus-extension-schema-sync \
    directus-extension-models \
    # directus-extension-field-actions \
    @directus-labs/spreadsheet-layout \
    @directus-labs/card-select-interfaces \
    @directus-labs/tour-group-interface \
    # @directus-labs/command-palette-module \
    @directus-labs/pdf-viewer-interface \
    @directus-labs/extension-steps-component \
    @directus-labs/super-header-interface \
    @directus-labs/switch-interface \
    @directus-labs/tree-view-table-layout


FROM base AS local
#We will assume that extensions and schema-sync are mapped to the container in docker-compose
USER node
CMD ["sh","start.sh"]

FROM base AS local_extensions_auto_rebuild
#We will assume that extensions are mapped to the container in docker-compose
USER root
COPY watch_extensions.sh /directus/watch_extensions.sh
CMD ["sh","watch_extensions.sh"]

FROM base AS prod
COPY ./extensions /directus/extensions
COPY ./instrument.cjs /directus/instrument.cjs
COPY ./schema-sync /directus/schema-sync
COPY ./start.sh /directus/start.sh
ARG SENTRY_AUTH_TOKEN
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}
RUN find extensions -mindepth 1 -maxdepth 1 -type d -exec bash -lc 'cd "$1" && npm install && npm install --dev && npm run build && npm run sentry:sourcemaps' _ {} \;
CMD ["sh","start.sh"]
