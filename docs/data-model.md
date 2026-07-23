# Modelo de dados

## Visão geral

Cada conta Google possui um documento de perfil e quatro documentos operacionais.
Os três contadores padrão usam uma coleção pública separada.

```text
users/{uid}
├── displayName
├── email
├── photoURL
└── updatedAt

users/{uid}/data/settings
├── preferências de expediente
├── aparência e fundo
└── updatedAt

users/{uid}/data/counters
├── items[0..4]
└── updatedAt

users/{uid}/data/images
├── items[0..9]
└── updatedAt

users/{uid}/data/archive
├── items[0..99]
└── updatedAt

generalConfig/workday
├── type: "workday"
├── startTime / endTime
└── daysOfWeek

generalConfig/payment-YYYY-MM-DD
└── type: "payment" + dateTime

generalConfig/holiday-YYYY-MM-DD
└── type: "holiday" + dateTime

teams/{teamId}
├── id, name, ownerUid, ownerTier, members map (admin | editor | viewer)
├── data/counters (items[0..4] Free ou items[0..14] Premium)
├── data/settings (counterGroups, hiddenCounterGroups, updatedAt)
└── invites/{inviteId} (teamId, teamName, role, createdBy, createdAt, expiresAt)
```

Convites usam um UUID imprevisível, duram até sete dias e podem ser lidos somente
pelo caminho exato. A entrada do membro não é escrita pelo navegador: a callable
Function `acceptTeamInvite` valida convite, expiração e cota em uma transação.

## Perfil — `/users/{uid}`

| Campo | Tipo | Origem |
| --- | --- | --- |
| `displayName` | string | Firebase Auth |
| `email` | string | Firebase Auth |
| `photoURL` | string | Firebase Auth |
| `tier` | `free` ou `premium` | Padrão `"free"`, atualizado via Stripe Webhook ou Admin |
| `stripeCustomerId` | string opcional | ID do cliente no Stripe |
| `aiGenerationsTotal` | number opcional | Contagem de imagens de IA geradas (máx 8 para free) |
| `aiGenerationsMonth` | string opcional | Mês corrente de cota (`YYYY-MM`) |
| `aiGenerationsMonthCount` | number opcional | Contagem de imagens de IA no mês (máx 40 para premium) |
| `isAdmin` | boolean opcional | Operação privilegiada |
| `updatedAt` | timestamp | `serverTimestamp()` |

Esse documento também é a origem do formato legado. `ensureUserData` lê eventuais
configurações/`customCounters` na raiz, cria os documentos novos se ainda faltarem e
então substitui a raiz somente pelos campos atuais do perfil. Quando `isAdmin` ou `tier`
existem, a normalização preserva o valor; o próprio usuário não pode alterar `tier` ou `isAdmin` pelas Rules.

## Configuração geral — `/generalConfig/{configId}`

A coleção inteira pode ser lida sem autenticação para que os contadores padrão
continuem disponíveis a visitantes. Escritas exigem Google OAuth e `isAdmin: true`
no perfil do UID autenticado.

| Documento | Campos | Operações no modal |
| --- | --- | --- |
| `workday` | `type`, `startTime`, `endTime`, `daysOfWeek`, `updatedAt` | editar |
| `payment-YYYY-MM-DD` | `type`, `dateTime`, `updatedAt` | criar, editar, excluir |
| `holiday-YYYY-MM-DD` | `type`, `dateTime`, `updatedAt` | criar, editar, excluir |

`dateTime` usa o formato local `YYYY-MM-DDTHH:mm:ss`. A UI expõe somente a data e
preserva o horário herdado do seed ao editar. O documento `workday` não pode ser
excluído. Na primeira sessão de um administrador, uma coleção completamente vazia
é populada em batch com `GENERAL_CONFIG_SEED` de `public/src/data.js` (1 expediente,
12 pagamentos e 10 feriados). Uma coleção já inicializada nunca é repopulada após
remoções intencionais.

## Configurações — `/users/{uid}/data/settings`

| Campo | Tipo | Padrão | Validação no cliente |
| --- | --- | --- | --- |
| `endHour` | number | fim global | inteiro 0–23 |
| `endMinutes` | number | fim global | inteiro 0–59 |
| `accentPrimary` | string hex | `#a78bfa` | `#RRGGBB` |
| `accentSecondary` | string hex | `#362860` | `#RRGGBB` |
| `backgroundEnabled` | boolean | `false` | boolean estrito ao aplicar |
| `backgroundStyle` | string | `lava` | chave conhecida do catálogo |
| `backgroundColorA` | string hex | `#7c3aed` | `#RRGGBB` |
| `backgroundColorB` | string hex | `#0ea5e9` | `#RRGGBB` |
| `backgroundSpeed` | number | `55` | clamp 20–100 |
| `backgroundIntensity` | number | `55` | clamp 15–100 |
| `showCustomCounters` | boolean | `true` | falso somente quando explícito |
| `dashboardLayout` | `focus`, `balanced` ou `compact` | `balanced` | valor conhecido |
| `dashboardSectionOrder` | string[] | `standard`, `custom`, `timeline`, `weather` | IDs conhecidos, únicos, até quatro |
| `hiddenDashboardSections` | string[] | `[]` | IDs únicos; `standard` não pode ser ocultado |
| `weatherWidgets` | object[] | três cidades atuais | até cinco; Forecast7 com coordenadas codificadas, textos e chaves validados |
| `notificationsEnabled` | boolean | `false` | verdadeiro somente após ativação explícita |
| `notificationLeadMinutes` | number[] | `[15]` | valores únicos entre 0, 5, 15, 60 e 1440 |
| `notificationSources` | map | todas `true` | chaves `workday`, `payment`, `holiday`, `counters` |
| `notificationQuietHours` | map | 22:00–07:00, desligado | boolean e horários locais `HH:mm` |
| `weatherEffectsEnabled` | boolean | `false` | boolean estrito ao aplicar |
| `counterGroups` | string[] | `[]` | até 10 grupos de contadores (strings até 30 chars cada) |
| `hiddenCounterGroups` | string[] | `[]` | grupos ocultos na visualização do workspace |
| `activeWorkspace` | `personal` ou `team:{teamId}` | `personal` | seleção restaurada e sincronizada entre abas/dispositivos |
| `updatedAt` | timestamp | servidor | `serverTimestamp()` |

O campo legado `customCounters` pode existir no documento raiz, mas não deve ser
usado para novas escritas.

## Settings de equipe — `/teams/{teamId}/data/settings`

Equipes Premium compartilham a ordem dos grupos (`counterGroups`) e os grupos
ocultos (`hiddenCounterGroups`). Todos os membros recebem esse documento em tempo
real. Somente `admin` e `editor` podem criar ou atualizar as preferências; `viewer`
tem acesso estritamente de leitura. Aparência, notificações, clima e layout geral
continuam pertencendo ao settings pessoal.

A Timeline e os candidatos de notificação são derivados dos snapshots de
`generalConfig`, `settings` e `counters`; não existe coleção persistida de
ocorrências. A projeção visual usa apenas o próximo pagamento, o próximo feriado e
a próxima ocorrência da categoria de contadores. O fallback local guarda IDs já
emitidos em `localStorage`; o backend usa uma fila idempotente privada.

## Dispositivos push — `/users/{uid}/devices/{deviceId}`

Somente as Cloud Functions acessam esses documentos. O cliente usa callables com
Auth Google e App Check; as Rules negam leitura e escrita direta até ao proprietário.
Cada usuário pode manter até cinco dispositivos com `fid`, `fidHash`, `timeZone`,
`platform`, `permission`, timestamps e `purgeAt`. Revogados expiram em 30 dias.

## Fila e métricas privadas

`/notificationQueue/{jobId}` registra ocorrência/borda/antecedência, lease, tentativas,
status e timestamps, sem título ou corpo. O ID é determinístico e a fila expira em
sete dias. `/pushMetrics/{YYYY-MM-DD}` contém apenas contagens agregadas de
`scheduled`, `sent`, `invalid`, `failed` e `suppressed`, com TTL de 30 dias.

## Contadores — `/users/{uid}/data/counters`

```js
{
  items: [/* até 5 (Free) ou 15 (Premium) objetos, em ordem de exibição */],
  updatedAt: serverTimestamp()
}
```

### Campos comuns

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | string | UUID quando disponível; estável durante edição |
| `name` | string | obrigatório; UI limita a 50 caracteres |
| `type` | `fixed` ou `recurring` | desconhecido é normalizado para `fixed` |
| `color` | string hex ou `null` | `null` herda o destaque principal |
| `createdAt` | string ISO | metadado preservado em edições |
| `imageId` | string ou `null` | referência a `data/images.items[].id` |
| `imageOpacity` | number | 0–100; cliente persiste inteiro, rules aceitam number |
| `overlayOpacity` | number | 0–100; cliente persiste inteiro, rules aceitam number |
| `group` | string ou `null` | nome de grupo cadastrado pelo usuário (até 30 chars) |
| `hidden` | boolean opcional | `true` para ocultar o contador da dashboard principal |
| `checklist` | object[] ou `null` | Array de até 3 subtarefas: `id` (string), `text` (string), `done` (boolean) |

### Período fixo

```json
{
  "id": "uuid",
  "name": "Férias",
  "type": "fixed",
  "startAtMs": 1784296800000,
  "endAtMs": 1785506400000,
  "color": "#22c55e",
  "createdAt": "2026-07-17T15:00:00.000Z"
}
```

`startAtMs` e `endAtMs` são inteiros Unix epoch em milissegundos. Isso mantém o
instante independente do fuso, permite às rules exigir `endAtMs > startAtMs` e é
exibido no fuso local do navegador. O cliente converte strings `startAt`/`endAt`
ISO de contas legadas para o formato numérico na próxima escrita. Entradas legadas
irrecuperáveis são ignoradas individualmente para não bloquear a migração das demais.

### Evento recorrente

```json
{
  "id": "uuid",
  "name": "Academia",
  "type": "recurring",
  "startTime": "18:00",
  "endTime": "19:30",
  "daysOfWeek": [1, 3, 5],
  "color": null,
  "createdAt": "2026-07-17T15:00:00.000Z"
}
```

`daysOfWeek` segue `Date.getDay()`: `0` domingo, `1` segunda, ..., `6` sábado.

## Biblioteca de imagens — `/users/{uid}/data/images`

O documento contém até dez metadados ordenados por slot. Os bytes ficam no Cloud
Storage em `/users/{uid}/counter-images/{slot}`, onde `slot` vai de 0 a 9.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | string | UUID estável usado pelos contadores |
| `slot` | inteiro | 0–9; determina o único objeto físico |
| `name` | string | nome original limitado a 120 caracteres |
| `size` | inteiro | 1 byte a 5 MiB |
| `contentType` | string | JPEG, PNG, WebP, GIF ou AVIF |
| `createdAt` | string ISO | data do upload no cliente |

Cada imagem pode ser referenciada por vários contadores sem duplicar bytes. Excluir
uma imagem limpa todas as referências a seu `imageId`. Dez slots de no máximo 5 MiB
impõem 50 MiB por usuário nas Storage Rules, independentemente dos metadados.

## Arquivo de Contadores — `/users/{uid}/data/archive`

```js
{
  items: [/* até 100 objetos do tipo fixed, do arquivamento mais recente ao mais antigo */],
  updatedAt: serverTimestamp()
}
```

Cada item no arquivo estende o formato de um contador do tipo `fixed` adicionando a data de arquivamento. O movimento é manual, exige confirmação e grava os documentos `counters` e `archive` na mesma transação. Alcançar 100% não arquiva o contador automaticamente.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `archivedAt` | string ISO | data e hora em que o contador foi arquivado |

## Dados locais do visitante

| Cookie | Conteúdo | Duração |
| --- | --- | --- |
| `hourTime` | hora selecionada | 365 dias |
| `minutesTime` | minuto selecionado | 365 dias |

O Modo de Foco não adiciona campo persistido ao Firestore. A chave de
`sessionStorage` `timekeeper:focus-counter` guarda por aba o ID estável de um
contador padrão ou pessoal e é removida ao sair da visualização.

As paisagens sonoras do Modo de Foco também não adicionam schema persistido:
catálogo, faixa selecionada, volume, loop e estado de reprodução vivem somente
na memória da aba. Os arquivos são assets locais em `public/sounds/` e são
carregados sob demanda, sem pré-cache do catálogo completo.

Os dois cookies são gravados com `path=/` e `SameSite=Lax`. Não possuem `Secure`
nem `HttpOnly`, pois são configurações não sensíveis acessadas pelo JavaScript.

## Sincronização e concorrência

Há uma subscription pública de `generalConfig` e cinco subscriptions de conta:
perfil, settings, counters, archive e metadados de images.
Escritas de contadores substituem o documento completo para remover campos legados
fora da allowlist. Duas abas podem produzir last-write-wins; `onSnapshot` reconcilia a UI
com a versão aceita pelo servidor.
Arquivar usa uma transação para remover um item fixo de `counters` e inseri-lo no
início de `archive`; a exclusão permanente também usa transação para não sobrescrever
uma alteração concorrente do histórico.

## Regras atuais

- Requer usuário autenticado, dono do UID e provedor `google.com`.
- `generalConfig` permite leitura pública; criação/edição/remoção exige perfil
  administrativo e o expediente não pode ser removido.
- O cliente não pode conceder nem alterar sua própria flag `isAdmin`.
- Subdocumentos permitidos: somente `settings`, `counters`, `images` e `archive`.
- Settings aceitam somente chaves conhecidas, tipos e ranges válidos.
- `counters.items` precisa ser lista e ter até cinco elementos válidos.
- Cada contador valida ID, nome, cor, imagem, opacidades, o schema fixo/recorrente e opcionalmente até 3 subtarefas no checklist.
- `archive.items` precisa ser lista e ter até 100 contadores arquivados com o campo `archivedAt` válido.
- Images aceitam até dez metadados válidos; Storage limita dono, tipo, slot e bytes.
- Horários recorrentes e dias da semana são validados por formato/range; períodos
  fixos exigem inteiros não negativos e fim posterior ao início.
- O documento raiz legado também limita `customCounters` a cinco.
- Não há índices compostos porque não existem queries de coleção.

As rules ainda não garantem unicidade dos dias recorrentes; o cliente remove
duplicatas e ordena esses valores antes de escrever.
Detalhes estão em [Segurança](security.md).

## Alterando o schema

1. Adicione um default seguro em `DEFAULTS` quando aplicável.
2. Valide/normalize o valor recebido.
3. Atualize a UI, `applySettings` e a escrita.
4. Atualize `ensureUserData` para contas antigas.
5. Fortaleça `firestore.rules` e seus testes.
6. Atualize este documento e o checklist de deploy.
