# AGENTS.md

Este arquivo define as regras de trabalho para pessoas e agentes automatizados no
Timekeeper. As instruções valem para todo o repositório. Para detalhes de produto,
arquitetura, schema, testes ou operação, consulte o documento específico em
`docs/` em vez de duplicar sua descrição aqui.

## Objetivo e princípios inegociáveis

O Timekeeper é uma dashboard temporal estática, responsiva e instalável. O fluxo
básico deve continuar útil sem conta; Google OAuth adiciona sincronização,
contadores, equipes, personalização, imagens e notificações.

- Preserve a experiência sem login e a privacidade por UID/workspace.
- Trate Firestore Rules e Storage Rules como parte do produto, não como proteção
  opcional posterior.
- Use dados em tempo real como fonte de verdade após autenticação.
- Não faça deploy, não altere o projeto Firebase e não escreva dados remotos sem
  solicitação explícita.
- Não versione service accounts, tokens, chaves privadas, segredos Stripe ou a
  chave privada VAPID. Configuração Web do Firebase, site key do App Check e chave
  pública VAPID são públicas por natureza.

## Antes de alterar

1. Leia `README.md` e o guia relevante listado em `docs/README.md`.
2. Execute `git status --short` e preserve alterações que não sejam suas.
3. Localize cliente, Rules, testes, documentação e cópias visuais de qualquer
   contrato que será alterado.
4. Faça a menor mudança coerente e evite dependências novas para ajustes locais.
5. Revise `git diff` antes de commit, push ou deploy.

## Mapa arquitetural resumido

- `public/index.html`: shell, marcação, contadores padrão, dialogs e preferências
  locais do visitante.
- `public/src/firebase.js`: Auth, Firestore, Storage, workspaces, CRUD, equipes,
  assinaturas em tempo real, personalização e integração com Functions.
- `public/src/time.js`: cálculos puros de intervalos e recorrência.
- `public/src/occurrences.js`: camada comum de ocorrências para Timeline e alertas.
- `public/src/weather.js`: widgets e atmosferas climáticas.
- `public/src/notifications.js`: preferências e candidatos de notificações locais.
- `public/src/focus.js` e `public/src/soundscapes.js`: Modo de Foco e áudio local.
- `public/src/pwa.js` e `public/sw.js`: instalação, atualização, cache offline e push.
- `public/src/style.css`: tokens, layout, superfícies, responsividade e movimento.
- `public/src/data.js`: seed/fallback anual de pagamentos e feriados.
- `functions/`: callables, Stripe, cotas de IA, convites, push e scheduler.
- `firestore.rules`: autorização, schemas e cotas de documentos.
- `storage.rules`: autorização, tipos, tamanho e slots de imagens.
- `tests/`: unitários, contratos, E2E e Rules.
- `firebase.json` e `firestore.indexes.json`: Hosting, emuladores, Functions, Rules,
  índices e TTL.

O frontend publicado não possui framework, bundler ou build. O Firebase SDK é
importado diretamente do CDN. Dependências npm da raiz servem a testes e automação;
as dependências em `functions/` pertencem ao runtime server-side.

## Invariantes

### Visitante

- Os três contadores padrão, clima, tela cheia e Modo de Foco devem funcionar sem
  autenticação.
- O fim do expediente permanece editável e persiste por 365 dias nos cookies
  `hourTime` e `minutesTime`.
- Contadores próprios, equipes, imagens e personalização persistida exigem conta.
- O fundo animado começa desligado para contas novas.

### Autenticação, administração e privacidade

- Login e reautenticação usam somente Google OAuth.
- Documentos pessoais em `/users/{uid}` pertencem exclusivamente ao próprio UID,
  salvo operações server-side explicitamente bloqueadas ao cliente.
- `generalConfig` é a exceção de leitura pública; escrita exige perfil Google com
  `isAdmin: true`.
- Não substitua autorização por esconder controles na UI. Toda mutação precisa ser
  validada novamente pelas Rules ou por uma Cloud Function autenticada.
- Conteúdo fornecido pelo usuário deve usar APIs DOM seguras ou escaping explícito
  antes de entrar em templates HTML.

### Workspaces e equipes

- `activeWorkspace` vive nos settings pessoais e aceita `personal` ou
  `team:{teamId}`. A seleção sincroniza entre abas/dispositivos.
- A troca de workspace deve cancelar/versionar subscriptions anteriores, limpar
  estado transitório e carregar contadores e settings do novo espaço sem mistura.
- Dados pessoais vivem em `/users/{uid}/data/*` e `/users/{uid}/counters/*`;
  dados compartilhados vivem em `/teams/{teamId}/data/*` e
  `/teams/{teamId}/counters/*`.
- `admin` e `editor` podem editar contadores e visualização da equipe. `viewer` é
  estritamente somente leitura no cliente e nas Rules.
- Cotas de um workspace de equipe usam o plano real do proprietário, não o plano
  do membro que está operando.
- Entrada por convite passa pela callable `acceptTeamInvite`. O cliente não pode se
  adicionar diretamente ao mapa `members`.
- Convites usam IDs imprevisíveis, permitem apenas leitura pelo caminho exato,
  expiram e nunca podem ser enumerados por convidados.

### Cotas alinhadas

- Contadores: 5 em Free e 15 em Premium. No cliente, use `getMaxCounters()` e o
  workspace ativo; nas Rules, use `getMaxCounters(userId)` e limite os IDs de slot
  a `0`–`4` ou `0`–`14`.
- Equipes criadas: 1 em Free e 3 em Premium.
- Membros por equipe: 5 em Free e 12 em Premium, conforme o perfil do proprietário.
- Biblioteca: até 10 slots, 5 MiB por imagem e 50 MiB no total pelas APIs previstas.
- Ao mudar uma cota, atualize atomicamente cliente, HTML/cópia, Rules, testes e
  documentação. Se houver validação server-side em Functions, atualize-a também.

### Dados em tempo real

- Settings pessoais: `/users/{uid}/data/settings`.
- Contadores pessoais: `/users/{uid}/counters/{slot}`.
- Arquivo e metadados de imagens: `/users/{uid}/data/archive` e `data/images`.
- Contadores e settings de equipe: `/teams/{teamId}/counters/{slot}` e
  `/teams/{teamId}/data/settings`.
- Os agregados `data/counters` são legados: podem ser lidos e removidos somente
  durante a migração para subcoleções; não aceite novas escritas neles.
- Use `onSnapshot` como fonte de verdade e cancele listeners ao trocar usuário,
  workspace ou sair.
- Preserve rollback visual em mutações otimistas, especialmente exclusão e ordem.
- Falhas de rede/permissão devem produzir estado ou toast compreensível sem deixar
  a interface fingindo que a gravação foi concluída.

### Contadores e tempo

- `fixed` exige `startAtMs < endAtMs`, com inteiros em milissegundos Unix; o cliente
  ainda lê strings ISO legadas durante migração.
- `recurring` exige `startTime`, `endTime` e ao menos um dia entre 0 e 6.
- Eventos que atravessam a meia-noite são válidos; o fim ocorre no dia seguinte.
- Novo contador fixo começa em “agora” e termina 24 horas depois por padrão.
- Edição preserva `id`, `createdAt` e ordem, salvo mudança explícita do usuário.
- Alterações de recorrência devem ser verificadas em `time.js`, `occurrences.js`,
  Timeline e notificações para evitar implementações temporais divergentes.

### Storage, Functions, push e PWA

- Imagens privadas ficam no Storage sob o UID; Firestore guarda apenas metadados.
- Mudanças em upload, quota ou exclusão devem manter cliente, `storage.rules`,
  `firestore.rules`, exclusão de conta e testes alinhados.
- Callables exigem usuário Google válido e validam argumentos no backend. Admin SDK
  não torna dados vindos do cliente confiáveis.
- Push não deve registrar conteúdo privado de contadores em logs, métricas ou filas.
- O service worker pode cachear somente o shell público. Nunca inclua respostas
  privadas do Firestore/Storage ou conteúdo de usuário no cache offline.
- Preserve atualização controlada do service worker e comportamento seguro quando
  push, App Check ou serviços externos não estiverem configurados.

## Convenções de implementação

- Use JavaScript simples e compatível com navegador; não introduza framework ou
  bundler sem decisão arquitetural explícita.
- Prefira funções pequenas, nomes descritivos e validação nas bordas.
- Campos de settings pessoais exigem revisão de `DEFAULTS`, normalização,
  `applySettings`, `ensureUserData`, salvamento, Rules e `docs/data-model.md`.
- Campos de equipe, perfil, Storage ou Functions seguem seus próprios schemas; não
  os force artificialmente pelo pipeline de settings pessoais.
- Novos fundos exigem opção HTML, descrição, runtime/CSS, limpeza de recursos,
  reduced motion e atualização de `docs/design.md` e `docs/testing.md`.
- Respeite foco, teclado, `aria-*`, `inert`, contraste e
  `prefers-reduced-motion`.
- Use caminhos relativos a `public/` para assets hospedados.
- Preserve a direção visual escura, editorial e discreta. Regras detalhadas de
  layout, superfícies e breakpoints pertencem a `docs/design.md`.

## Validação

Execute sempre:

```bash
npm run check
git diff --check
```

Use Node.js 22+. E2E e Rules exigem Java 21+.

| Área alterada | Validação adicional mínima |
| --- | --- |
| HTML/CSS/UI | checklist visual em 320, 390, 768 e desktop; fundos ligados/desligados |
| Movimento/canvas/áudio | reduced motion, aba oculta e limpeza/pausa de recursos |
| Auth, Firestore, equipes ou migração | `npm run test:e2e` e `npm run test:rules` |
| Storage/imagens | `npm run test:e2e` e `npm run test:rules` |
| Functions/push/Stripe/convites | `npm run check`, testes de Functions e fluxo local aplicável |
| Rules ou schema | testes positivos, negativos, acesso cruzado e campos desconhecidos |
| PWA/cache/service worker | instalação, offline, atualização e ausência de dados privados no cache |

Para Auth/Firestore/equipes, teste proporcionalmente: login/logout, primeiro login,
duas abas, troca de workspace, papéis admin/editor/viewer, falha de rede, cotas e
isolamento entre dois usuários. O checklist completo fica em `docs/testing.md`.

A CI em `.github/workflows/ci.yml` executa sintaxe, unitários, contratos, testes das
Functions, E2E Chromium desktop/mobile e Firestore/Storage Rules em pushes e PRs.

## Deploy

- Deploy é sempre uma ação explícita.
- Confirme branch, worktree e projeto com `git status --short` e `firebase use`.
- Publique somente os alvos afetados: Hosting, Functions, Firestore Rules, Storage
  Rules e/ou índices. Não presuma que publicar Hosting atualiza qualquer outro alvo.
- Mudanças coordenadas de cliente e autorização devem manter compatibilidade durante
  toda a janela de deploy.
- Siga a matriz e os checklists de `docs/deployment.md`; não mantenha comandos de
  release duplicados neste arquivo.
- Após publicar, valide em janela privada e monitore console, Auth, Rules, Functions
  e uso dos serviços afetados.

## Documentação obrigatória

Atualize os documentos no mesmo trabalho quando houver mudança em:

- comportamento de produto ou papéis/permissões;
- schema, Rules, caminhos ou migração de dados;
- configuração, dependência, emulador ou comando de execução;
- Functions, push, App Check, Stripe, Storage ou procedimento operacional;
- tokens visuais, breakpoints, backgrounds, PWA ou cache;
- riscos, limitações, observabilidade, deploy ou rollback.

Use `docs/README.md` para escolher o documento proprietário. Evite copiar detalhes
entre `AGENTS.md`, README e guias: este arquivo deve conter guardrails; os guias
devem conter explicações e procedimentos completos.
