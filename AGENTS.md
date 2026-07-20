# AGENTS.md

Este arquivo orienta pessoas e agentes automatizados que trabalham no Timekeeper.
As instruções valem para todo o repositório.

## Objetivo do produto

Manter uma dashboard de tempo simples, elegante e responsiva. O uso básico deve
continuar funcionando sem conta; login Google adiciona sincronização, contadores
pessoais e personalização visual.

## Antes de editar

1. Leia `README.md` e o guia relevante em `docs/`.
2. Verifique `git status --short` e preserve alterações que não são suas.
3. Localize todos os contratos duplicados antes de mudar um limite ou formato.
4. Não faça deploy, altere o projeto Firebase ou dados remotos sem solicitação.

## Mapa do código

- `public/index.html`: marcação, contadores padrão, cookies, cálculo compartilhado
  e carregamento do widget meteorológico.
- `public/src/time.js`: cálculos puros de intervalos, progresso e recorrência.
- `public/src/firebase.js`: configuração Firebase, autenticação, subscriptions,
  CRUD, renderização dos contadores pessoais e runtime dos fundos.
- `public/src/style.css`: tokens, superfícies, layout, sidebar, modal, responsividade
  e animações.
- `public/src/data.js`: pagamentos e feriados do ano corrente.
- `firestore.rules`: autorização e limites no servidor.
- `firebase.json`: Hosting, regras e índices.

## Invariantes que devem permanecer alinhadas

### Limite de contadores

O limite é de 5 contadores para contas gratuitas (Free) e até 15 contadores para contas Premium. O limite aparece em três camadas:

- `MAX_COUNTERS` (calculado com base em `userTier`) em `public/src/firebase.js`;
- texto e contador visual em `public/index.html`;
- função `getMaxCounters(uid)` em `firestore.rules`.

Qualquer alteração exige atualizar e testar as três.

### Autenticação e privacidade

- Login/cadastro é somente Google OAuth.
- Cada usuário só pode acessar `/users/{seu uid}` e os dois documentos permitidos.
- Não afrouxe regras para `request.auth != null` sem conferir propriedade pelo UID.
- A configuração Firebase do cliente é pública por natureza; nunca adicione chaves
  privadas, service accounts ou tokens ao repositório.

### Experiência sem login

- O horário do expediente deve continuar editável no header.
- `hourTime` e `minutesTime` permanecem em cookies por 365 dias.
- Contadores pessoais, aparência e fundos animados exigem conta.
- O fundo animado começa desligado para contas novas.

### Dados em tempo real

- Configurações vivem em `/users/{uid}/data/settings`.
- Contadores vivem em `/users/{uid}/data/counters`.
- Use `onSnapshot` como fonte de verdade após login.
- Preserve rollback visual em operações otimistas de excluir e reordenar.
- Cancele subscriptions ao trocar de usuário ou sair.

### Contadores

- `fixed`: exige `startAtMs < endAtMs`, armazenados como inteiros em milissegundos
  desde Unix epoch; o cliente ainda lê strings ISO legadas durante a migração.
- `recurring`: exige `startTime`, `endTime` e pelo menos um dia entre 0 e 6.
- Eventos que atravessam a meia-noite são válidos; o fim passa ao dia seguinte.
- O início padrão de um novo contador fixo é o horário atual; o fim é 24 h depois.
- Preserve `id` e `createdAt` ao editar.

## Convenções de implementação

- Mantenha JavaScript simples e compatível com navegador; não introduza bundler ou
  framework sem uma decisão explícita de arquitetura.
- Prefira funções pequenas, nomes descritivos e validação na borda da aplicação.
- Use APIs DOM seguras (`textContent`, `createElement`) para conteúdo do usuário.
- Ao adicionar um campo persistido, atualize `DEFAULTS`, controles, `applySettings`,
  migração em `ensureUserData`, salvamento, regras e documentação do schema.
- Ao adicionar um background, atualize HTML, `BACKGROUND_DESCRIPTIONS`, aplicação,
  CSS/runtime, reduced motion e checklist visual.
- Respeite `prefers-reduced-motion` e mantenha foco, `aria-*`, `inert` e teclado.
- Evite dependências novas para mudanças pequenas. O npm serve apenas a testes e
  automação; o runtime publicado continua sem build e sem dependências empacotadas.
- Use caminhos relativos a `public/` em assets hospedados.

## Direção visual

- Interface escura, editorial e discreta; informação temporal é a protagonista.
- Superfícies translúcidas precisam manter contraste com qualquer fundo.
- As duas cores configuráveis devem continuar propagando para barras e widgets.
- Movimento deve ser fluido, sem flashes, pops por segundo ou custo excessivo.
- Três cards mantêm a escala padrão; quatro e cinco reduzem tipografia no desktop.
- Em até 900 px, cards ficam em uma coluna; em até 600 px, ações do header compactam.

Detalhes estão em `docs/design.md`.

## Validação mínima

Sempre execute:

```bash
npm run check
```

Para Auth/Firestore ou regras, execute também (Java 21+):

```bash
npm run test:e2e
npm run test:rules
git diff --check
```

Depois teste manualmente o fluxo afetado. Para mudanças em Auth/Firestore:

- login e logout;
- primeiro login e migração de documento legado;
- atualização em duas abas;
- falha de rede e estados de erro;
- tentativa de ultrapassar cinco contadores;
- isolamento entre dois usuários.

Para UI, verifique 320 px, 390 px, 768 px e desktop, com fundos desligados e
ligados. Em alterações de animação, teste também reduced motion.

A CI em `.github/workflows/ci.yml` repete syntax, unit, contracts, E2E desktop/mobile
e rules em todo push e em pull requests.

## Deploy

- Deploy é uma ação explícita, nunca uma consequência automática de editar.
- Confirme o projeto ativo com `firebase use`.
- Publique Hosting e regras juntos quando o contrato de dados mudar:

```bash
firebase deploy --only hosting,firestore:rules
```

- Após publicar, valide o site em janela privada para detectar cache antigo.
- Não confunda `firebase deploy --only hosting` com atualização das regras.

## Documentação obrigatória

Atualize os documentos no mesmo trabalho quando houver mudança em:

- comportamento de produto;
- schema, regras ou caminho do Firestore;
- configuração, dependência ou comando de execução;
- tokens, breakpoints ou catálogo de fundos;
- riscos, limitações ou procedimento de deploy.
