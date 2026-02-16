FROM node:20-alpine

WORKDIR /app

# Instala dependências primeiro (cache de camada)
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Copia o restante do código
COPY src/ ./src/

# Cria diretório de sessões
RUN mkdir -p storage/sessions

ENV NODE_ENV=production
ENV PORT=3333

EXPOSE 3333

CMD ["node", "src/index.js"]
