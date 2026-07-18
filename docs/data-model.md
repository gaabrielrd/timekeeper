# Modelo de dados

## Visão geral

Cada conta Google possui um documento de perfil e três documentos operacionais.

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
```

## Perfil — `/users/{uid}`

| Campo | Tipo | Origem |
| --- | --- | --- |
| `displayName` | string | Firebase Auth |
| `email` | string | Firebase Auth |
| `photoURL` | string | Firebase Auth |
| `updatedAt` | timestamp | `serverTimestamp()` |

Esse documento também é a origem do formato legado. `ensureUserData` lê eventuais
configurações/`customCounters` na raiz, cria os documentos novos se ainda faltarem e
então substitui a raiz somente pelos campos atuais do perfil.

## Configurações — `/users/{uid}/data/settings`

| Campo | Tipo | Padrão | Validação no cliente |
| --- | --- | --- | --- |
| `endHour` | number | `17` | opções 17–22 na UI |
| `endMinutes` | number | `55` | opções 25 ou 55 na UI |
| `accentPrimary` | string hex | `#a78bfa` | `#RRGGBB` |
| `accentSecondary` | string hex | `#362860` | `#RRGGBB` |
| `backgroundEnabled` | boolean | `false` | boolean estrito ao aplicar |
| `backgroundStyle` | string | `lava` | chave conhecida do catálogo |
| `backgroundColorA` | string hex | `#7c3aed` | `#RRGGBB` |
| `backgroundColorB` | string hex | `#0ea5e9` | `#RRGGBB` |
| `backgroundSpeed` | number | `55` | clamp 20–100 |
| `backgroundIntensity` | number | `55` | clamp 15–100 |
| `showCustomCounters` | boolean | `true` | falso somente quando explícito |
| `updatedAt` | timestamp | servidor | `serverTimestamp()` |

O campo legado `customCounters` pode existir no documento raiz, mas não deve ser
usado para novas escritas.

## Contadores — `/users/{uid}/data/counters`

```js
{
  items: [/* até cinco objetos, em ordem de exibição */],
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

## Dados locais do visitante

| Cookie | Conteúdo | Duração |
| --- | --- | --- |
| `hourTime` | hora selecionada | 365 dias |
| `minutesTime` | minuto selecionado | 365 dias |

São gravados com `path=/` e `SameSite=Lax`. Não possuem `Secure` nem `HttpOnly`,
pois são configurações não sensíveis acessadas pelo JavaScript.

## Sincronização e concorrência

Há três subscriptions independentes: settings, counters e metadados de images.
Escritas de contadores substituem o documento completo para remover campos legados
fora da allowlist. Duas abas podem produzir last-write-wins; `onSnapshot` reconcilia a UI
com a versão aceita pelo servidor.

## Regras atuais

- Requer usuário autenticado, dono do UID e provedor `google.com`.
- Subdocumentos permitidos: somente `settings`, `counters` e `images`.
- Settings aceitam somente chaves conhecidas, tipos e ranges válidos.
- `counters.items` precisa ser lista e ter até cinco elementos válidos.
- Cada contador valida ID, nome, cor, imagem, opacidades e o schema fixo/recorrente.
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
