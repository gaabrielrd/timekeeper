# Fase 5B — push confiável

Status: **implementada no repositório; configuração e deploy pendentes**.

## Decisões adotadas

- Firebase Cloud Messaging com Firebase Installation IDs (FID), fluxo recomendado
  pelo SDK atual no lugar de registration tokens legados.
- Cloud Functions de 2ª geração em `southamerica-east1`.
- Uma função `onSchedule` a cada minuto, com uma instância concorrente.
- Cálculo de expediente, calendários e recorrências no fuso IANA de cada dispositivo.
- Até cinco dispositivos ativos por usuário, com revogação individual no logout.
- Entrega *best effort*: atraso alvo de até dois minutos e recuperação/tentativas
  dentro de uma janela de 15 minutos.
- Fila idempotente por sete dias, métricas agregadas por 30 dias e limpeza via TTL.
- App Check com reCAPTCHA Enterprise exigido pelas callables em produção.

FCM é sem custo direto. Cloud Scheduler cobra por job após a franquia da conta, e
Functions/Firestore seguem as franquias e preços do plano Blaze. Alertas de orçamento
avisam, mas não interrompem automaticamente o consumo.

Fontes oficiais:

- [FCM para Web](https://firebase.google.com/docs/cloud-messaging/web/get-started)
- [Envio por FID com Admin SDK](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk)
- [Gerenciamento de registros FCM](https://firebase.google.com/docs/cloud-messaging/manage-tokens)
- [Functions agendadas](https://firebase.google.com/docs/functions/schedule-functions)
- [App Check para Web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
- [Políticas TTL](https://firebase.google.com/docs/firestore/ttl)
- [Planos e faturamento](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)

## Fluxo

```text
Navegador/PWA
├── permissão solicitada somente pelo toggle
├── App Check reCAPTCHA Enterprise
├── FCM register() reutilizando /sw.js
└── callable registerPushDevice
          │
          ▼
users/{uid}/devices/{deviceId} (privado)
          │
          ▼
Cloud Scheduler (1 minuto)
          │
          ▼
dispatchPushNotifications — southamerica-east1
├── lê generalConfig uma vez por execução
├── deriva ocorrências no fuso de cada dispositivo
├── assume jobId determinístico em transação
├── envia mensagem FCM data-only por FID
├── aplica silêncio, backoff e revogação de FID inválido
└── incrementa métricas agregadas sem conteúdo do evento
```

O cadastro usa `onRegistered()` porque o SDK pode atualizar o FID durante a vida da
instalação. O registro existente de `/sw.js` é passado para `register()`, evitando um
segundo service worker. Mensagens em background são exibidas pelo mesmo worker;
mensagens em primeiro plano passam pelo listener da página.

## Modelo de dados

```text
users/{uid}/devices/{deviceId}
├── fid / fidHash
├── timeZone
├── permission: granted | revoked
├── platform
├── createdAt / refreshedAt / revokedAt
└── purgeAt

notificationQueue/{jobId}
├── uid / deviceId
├── occurrenceId / edge / leadMinutes
├── scheduledAt / expiresAt / purgeAt
├── status: claimed | sent | invalid | failed | suppressed
├── attemptCount / leaseUntil / nextAttemptAt
└── createdAt / updatedAt

pushMetrics/{YYYY-MM-DD}
├── scheduled / sent / invalid / failed / suppressed
├── updatedAt
└── purgeAt
```

O `jobId` é SHA-256 de UID, dispositivo, ocorrência, borda e antecedência. A fila
não armazena título, nome do contador ou corpo da notificação. FID, dispositivos,
fila e métricas são negados pelas Firestore Rules inclusive ao proprietário; somente
o Admin SDK das Functions acessa esses documentos.

## Idempotência, silêncio e falhas

1. O scheduler recalcula candidatos vencidos nos últimos 15 minutos.
2. Uma transação cria ou recupera o job e assume um lease de dois minutos.
3. Jobs `sent`, `invalid` ou `suppressed` nunca são assumidos novamente.
4. Horário de silêncio gera `suppressed`, sem entrega posterior.
5. FID inválido gera `invalid` e revoga o dispositivo.
6. Falha transitória usa backoff de 1, 2, 4 e 8 minutos enquanto couber na janela.
7. TTL remove dispositivos revogados após 30 dias, fila após sete dias e métricas
   após 30 dias. A exclusão de conta remove dispositivos e jobs imediatamente.

## Limites operacionais

- A execução processa no máximo 200 dispositivos ativos, com concorrência interna
  de dez. Ao atingir 200, o log marca `truncated: true`; antes de crescer além desse
  patamar, particione o scheduler por shard.
- Dispositivos sem refresh por 30 dias são revogados.
- Cadastro repetido em menos de 30 segundos é tratado como já atualizado.
- A aplicação mantém o fallback local quando FCM/App Check não estão configurados
  ou quando o cadastro push falha.
- Não há SLA. Economia de bateria, políticas do navegador e limitações de Web Push
  ainda podem atrasar ou impedir entrega.

## Configuração necessária antes do deploy

1. No Firebase Console, gere um certificado Web Push e copie a chave pública VAPID.
2. Em App Check, registre a aplicação Web com reCAPTCHA Enterprise e copie a site key.
3. Preencha os dois valores públicos em `public/src/runtime-config.js`.
4. Confirme que Cloud Messaging API, Cloud Functions, Cloud Build, Artifact Registry
   e Cloud Scheduler estão habilitados; o primeiro deploy pode solicitar ativação.
5. Crie um orçamento e alertas na conta de faturamento.
6. Publique Functions, Rules, TTL/indexes e Hosting conforme `docs/deployment.md`.
7. Teste em um dispositivo real com a página em segundo plano e depois fechada.

Não adicione service account, chave privada VAPID ou segredo reCAPTCHA ao
repositório. A VAPID pública e a site key do App Check são configurações públicas do
cliente; a autorização continua nas credenciais Google, App Check e Admin SDK.
