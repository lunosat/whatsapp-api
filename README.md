# WhatsApp API (Baileys + REST)

Projeto em Node.js que expõe uma API REST para gerenciar múltiplas conexões WhatsApp utilizando [Baileys](https://baileys.wiki/docs/api/) e persistindo sessões/mensagens no MongoDB via Mongoose. Cada sessão representa um número/instância que pode ser pareado via código numérico.

## Pré-requisitos

- Node.js 18+
- Yarn ou npm
- MongoDB acessível (ex.: `mongodb://127.0.0.1:27017/whatsapp_api`)

## Variáveis de ambiente (`.env`)

```
PORT=3333
MONGODB_URI=mongodb://127.0.0.1:27017/whatsapp_api
AUTH_FOLDER=storage/sessions
PAIRING_CODE_TTL=120000
PRINT_QR_IN_TERMINAL=false
```

## Instalação e execução

### Opção 1 — Docker (recomendado)

Basta ter [Docker](https://docs.docker.com/get-docker/) instalado:

```bash
# Subir tudo (API + MongoDB):
docker compose up -d

# Ver logs em tempo real:
docker compose logs -f app

# Parar sem perder dados:
docker compose down

# Parar E destruir volumes (sessões + banco):
docker compose down -v
```

> **Persistência**: as sessões WhatsApp ficam no volume `sessions_data` e o MongoDB no volume `mongo_data`. Mesmo que o container seja destruído (`docker compose down`), os dados são mantidos — só são removidos com a flag `-v`.

Variáveis podem ser customizadas no `.env` (o Compose as lê automaticamente):

```
PORT=3333
PAIRING_CODE_TTL=120000
PRINT_QR_IN_TERMINAL=false
MONGO_PORT=27017
```

### Opção 2 — Local (sem Docker)

```bash
yarn install
yarn start
# modo desenvolvimento com reload automático (ignora storage/)
yarn dev
```

O servidor sobe em `http://localhost:3333`. Um endpoint de saúde está exposto em `/health`.

## Fluxo de conexão

1. **Criar sessão** `POST /api/sessions` com body opcional `{ "sessionId": "loja-01", "label": "Loja Centro" }`.
2. **Gerar código de pareamento** `POST /api/sessions/{sessionId}/pairing-code` com `{ "phoneNumber": "5511999999999" }`. A resposta contém `pairingCode` válido por ~2min.
3. **Inserir o código no WhatsApp** (Menu > Conectar dispositivo > Conectar com código).
4. Após `connection=open`, status muda para `connected` e é possível enviar mensagens via API.

> Caso prefira autenticar via QR, defina `PRINT_QR_IN_TERMINAL=true`. Você pode:
> - Acompanhar o QR ASCII direto no console (quando disponível);
> - Consumir `GET /api/sessions/{sessionId}/qr` para obter o QR atual via API (útil para exibir em um frontend).

## Endpoints principais

| Método | Caminho | Descrição |
| --- | --- | --- |
| `POST` | `/api/sessions` | Cria uma nova sessão e inicializa o cliente Baileys. |
| `GET` | `/api/sessions` | Lista todas as sessões com status atual. |
| `GET` | `/api/sessions/:sessionId` | Detalhes da sessão (status, número conectado, código atual). |
| `GET` | `/api/sessions/:sessionId/qr` | Retorna o QR code atual (quando disponível) e o timestamp da última atualização. |
| `POST` | `/api/sessions/:sessionId/pairing-code` | Gera um novo código de pareamento para o número informado. |
| `POST` | `/api/sessions/:sessionId/messages` | Envia mensagem de texto `{ "to": "5511999999999", "message": "Olá" }`. |
| `GET` | `/api/sessions/:sessionId/messages?limit=50&direction=incoming` | Lista mensagens persistidas (com paginação via `limit` e filtro de direção). |
| `DELETE` | `/api/sessions/:sessionId/messages` | Remove histórico de mensagens de uma sessão. |
| `DELETE` | `/api/sessions/:sessionId` | Faz logout, remove credenciais e apaga sessões/mensagens. |
| `GET` | `/api/metrics` | Retorna métricas globais (sessões, mensagens, falhas) para dashboards. |
| `GET` | `/api/metrics/sessions/:sessionId` | Estatísticas detalhadas de uma sessão específica. |

### Respostas de exemplo

**Criação de sessão**

```json
{
  "_id": "665f...",
  "sessionId": "loja-01",
  "label": "Loja Centro",
  "status": "idle",
  "createdAt": "2025-11-14T04:30:00.000Z",
  "updatedAt": "2025-11-14T04:30:00.000Z"
}
```

**Código de pareamento**

```json
{
  "pairingCode": "123-456",
  "session": {
    "sessionId": "loja-01",
    "status": "waiting-code",
    "pairingCode": "123-456",
    "pairingCodeExpiresAt": "2025-11-14T04:32:00.000Z"
  }
}
```

**QR code via API**

```json
{
  "sessionId": "loja-01",
  "available": true,
  "qrCode": "otpauth://wa...",
  "qrCodeUpdatedAt": "2025-11-14T04:33:12.000Z",
  "status": "waiting-qr"
}
```

**Envio de mensagem**

```json
{
  "messageId": "BAE5...",
  "status": "sent"
}
```

## Estrutura

- `src/index.js` – bootstrap do servidor, conexão Mongo e restauração das sessões.
- `src/whatsapp/` – serviço que gerencia múltiplos sockets Baileys e salva eventos.
- `src/controllers` / `src/routers` – camada HTTP (REST) para sessões e mensagens.
- `storage/sessions` – diretório (gitkeep) usado para armazenar credenciais multi-device.

## Observações

- Cada sessão é isolada e pode operar em paralelo, permitindo múltiplos números conectados.
- Logs e estados são persistidos em MongoDB; mensagens recebidas/enviadas ficam em `MessageModel`.
- Para novos números, basta criar outra sessão e gerar um novo código.
- Em caso de desconexão, o serviço tenta reconectar automaticamente. Se o WhatsApp avisar logout, é necessário gerar novo código.
- Para autenticação via QR, defina `PRINT_QR_IN_TERMINAL=true` no `.env`; além do QR no console, o endpoint `GET /api/sessions/{sessionId}/qr` retorna o último QR registrado para uso em frontends.
- Métricas globais e por sessão estão disponíveis nos endpoints `/api/metrics` e `/api/metrics/sessions/:sessionId`, permitindo construir dashboards de acompanhamento.

## Documentação detalhada das rotas

### Saúde

- **GET `/health`**
  - Retorna o status do servidor.
  - **Resposta 200**
    ```json
    { "status": "ok", "timestamp": "2025-11-14T05:05:00.000Z" }
    ```

### Sessões

- **POST `/api/sessions`**
  - Cria uma nova sessão.
  - **Body**
    ```json
    { "sessionId": "loja-01", "label": "Loja Centro" }
    ```
    `sessionId` é opcional; se omitido será gerado automaticamente.
  - **Resposta 201**
    ```json
    {
      "_id": "665f...",
      "sessionId": "loja-01",
      "label": "Loja Centro",
      "status": "idle",
      "createdAt": "2025-11-14T04:30:00.000Z",
      "updatedAt": "2025-11-14T04:30:00.000Z"
    }
    ```

- **GET `/api/sessions`**
  - Lista todas as sessões.
  - **Resposta 200**
    ```json
    {
      "items": [
        {
          "sessionId": "loja-01",
          "status": "waiting-qr",
          "phoneNumber": null,
          "pairingCode": null,
          "qrCodeUpdatedAt": "2025-11-14T04:33:12.000Z"
        }
      ]
    }
    ```

- **GET `/api/sessions/:sessionId`**
  - Retorna detalhes da sessão (status, número, timestamps, códigos atuais).
  - **Resposta 200**: objeto completo do `SessionModel`.
  - **Erros**: `404` se não existir.

- **GET `/api/sessions/:sessionId/qr`**
  - Retorna o QR atual quando disponível.
  - **Resposta 200**
    ```json
    {
      "sessionId": "loja-01",
      "available": true,
      "qrCode": "otpauth://wa...",
      "qrCodeUpdatedAt": "2025-11-14T04:33:12.000Z",
      "status": "waiting-qr"
    }
    ```
  - **Erros**: `404` se a sessão não existir.

- **POST `/api/sessions/:sessionId/pairing-code`**
  - Gera um código numérico para pareamento.
  - **Body**
    ```json
    { "phoneNumber": "5511999999999" }
    ```
  - **Resposta 200**
    ```json
    {
      "pairingCode": "123-456",
      "session": {
        "sessionId": "loja-01",
        "status": "waiting-code",
        "pairingCode": "123-456",
        "pairingCodeExpiresAt": "2025-11-14T04:32:00.000Z"
      }
    }
    ```
  - **Erros**: `400` (telefone inválido), `404` (sessão não encontrada), `409` (sessão já conectada).

- **DELETE `/api/sessions/:sessionId`**
  - Faz logout, remove credenciais armazenadas e exclui mensagens da sessão.
  - **Resposta 200**
    ```json
    { "success": true }
    ```

### Mensagens

- **GET `/api/sessions/:sessionId/messages`**
  - Lista mensagens persistidas.
  - **Query params**
    - `limit` (padrão 50, máx. 200)
    - `direction` (`incoming` ou `outgoing`)
    - `before` (timestamp ISO para paginação).
  - **Resposta 200**
    ```json
    {
      "limit": 50,
      "items": [
        {
          "sessionId": "loja-01",
          "direction": "incoming",
          "from": "5511999999999",
          "to": "5511888888888",
          "text": "Oi",
          "messageTimestamp": "2025-11-14T04:40:00.000Z"
        }
      ]
    }
    ```

- **POST `/api/sessions/:sessionId/messages`**
  - Envia uma mensagem de texto.
  - **Body**
    ```json
    { "to": "5511999999999", "message": "Olá, tudo bem?" }
    ```
  - **Resposta 201**
    ```json
    { "messageId": "BAE5...", "status": "sent" }
    ```
  - **Erros**: `400` (dados inválidos ou sessão desconectada), `404` (sessão não encontrada).

- **DELETE `/api/sessions/:sessionId/messages`**
  - Remove todo o histórico de mensagens da sessão.
  - **Resposta 200**
    ```json
    { "success": true }
    ```

### Métricas

- **GET `/api/metrics`**
  - Retorna métricas globais para dashboards.
  - **Resposta 200**
    ```json
    {
      "generatedAt": "2025-11-14T05:10:00.000Z",
      "sessions": {
        "total": 4,
        "byStatus": {
          "connected": 2,
          "waiting-qr": 1,
          "waiting-code": 1
        },
        "active": 2,
        "waiting": 2
      },
      "messages": {
        "total": 180,
        "incoming": 95,
        "outgoing": 85,
        "failed": 3,
        "last24h": { "total": 40, "failed": 1 },
        "latest": [
          {
            "sessionId": "loja-01",
            "direction": "outgoing",
            "status": "sent",
            "text": "Pedido enviado",
            "messageTimestamp": "2025-11-14T05:08:00.000Z"
          }
        ]
      }
    }
    ```

- **GET `/api/metrics/sessions/:sessionId`**
  - Estatísticas detalhadas de uma sessão.
  - **Resposta 200**
    ```json
    {
      "sessionId": "loja-01",
      "status": "connected",
      "totals": { "messages": 80, "failed": 1 },
      "directions": { "incoming": 40, "outgoing": 40 },
      "statuses": { "sent": 39, "received": 40, "failed": 1 },
      "last24h": { "total": 25, "failed": 0 },
      "latestMessages": [
        {
          "direction": "outgoing",
          "status": "sent",
          "text": "Seu pedido saiu para entrega",
          "messageTimestamp": "2025-11-14T05:07:00.000Z"
        }
      ]
    }
    ```

## Códigos de erro comuns

| Código | Motivo | Exemplos |
| --- | --- | --- |
| `400` | Requisição inválida | Telefone/mensagem vazia, sessão não conectada para envio. |
| `404` | Recurso não encontrado | Sessão inexistente, mensagens de sessão inexistente. |
| `409` | Conflito | Tentar criar sessão com `sessionId` duplicado ou gerar código numérico quando já conectado. |
| `500` | Erro interno | Falha inesperada (verifique logs do servidor). |
