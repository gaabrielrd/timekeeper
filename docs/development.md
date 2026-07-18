# Desenvolvimento local

## Pré-requisitos

- Git.
- Navegador moderno com suporte a módulos ES, `<dialog>`, `inert`, canvas e CSS
  `color-mix()`.
- Node.js 22+.
- Java 21+, exigido pela versão atual da Firebase CLI para o Firestore Emulator.
- Acesso ao projeto Firebase apenas para operações remotas.

O projeto possui dependências npm apenas de desenvolvimento/testes e não tem build.

## Preparação

```bash
git clone https://github.com/gaabrielrd/timekeeper.git
cd timekeeper
npm ci
firebase login
firebase use
```

`firebase use` deve mostrar `timekeeper-d9a0a` quando a intenção for trabalhar no
projeto atual. Login só é necessário para recursos remotos da CLI.

## Servindo a interface

Para testar os assets como o Firebase Hosting os serve, sem tocar em produção:

```bash
firebase emulators:start --only hosting,auth,firestore --project demo-timekeeper
```

Abra `http://127.0.0.1:5000/?emulators=1`.

Um servidor HTTP estático alternativo também é suficiente para trabalho apenas em
HTML/CSS, mas o comportamento de rewrites pode ser diferente.

Não use `file://`: imports de módulo, CORS e autenticação dependem de uma origem.

## Emuladores Auth e Firestore

O cliente conecta aos emuladores somente quando duas condições são verdadeiras:

1. hostname é `localhost` ou `127.0.0.1`;
2. a URL contém `?emulators=1`.

As portas versionadas do app são Hosting 5000, Auth 9099, Firestore 8080 e UI 4000.
A suíte isolada de Rules usa Firestore 8081 por meio de
`firebase.rules-test.json`, evitando colisão com o emulador dos E2E. Sem o parâmetro,
mesmo em localhost, o SDK usa o projeto configurado; confira a URL antes de criar
dados de teste.

## Fluxo recomendado de alteração

1. Leia `AGENTS.md` e o documento da área afetada.
2. Confirme o estado do worktree com `git status --short`.
3. Faça a menor alteração coerente.
4. Execute `npm run check` e `npm run test:rules` quando aplicável.
5. Execute o checklist manual proporcional ao risco.
6. Atualize a documentação quando contratos mudarem.
7. Revise `git diff` antes de commit/deploy.

## Checagens disponíveis

```bash
npm run check
npm run test:e2e
npm run test:rules
git diff --check
```

`npm run check` verifica sintaxe, cálculos temporais, contratos entre arquivos,
calendários e links da documentação. `npm run test:e2e` inicia servidor estático,
Auth/Firestore Emulator e Chromium para fluxos visitante e autenticado em desktop e
mobile. `npm run test:rules` inicia o emulador e testa autorização/schema. O
JavaScript inline é compilado como parte dos contratos.

A mesma suíte roda em `.github/workflows/ci.yml` com Node 22 e Java 21.

## Onde implementar cada mudança

| Mudança | Arquivos mais prováveis |
| --- | --- |
| Data de pagamento/feriado | `public/src/data.js` |
| Cálculo padrão/recorrente | `public/src/time.js` e testes unitários |
| Auth, live data ou CRUD | `public/src/firebase.js`, `firestore.rules` |
| Campo de configuração | HTML, JS, rules e `docs/data-model.md` |
| Estilo visual/layout | `public/src/style.css` e talvez HTML |
| Novo fundo | HTML, CSS/JS, descrição e docs de design |
| Limite de contadores | JS, HTML, rules e documentação |
| Hosting/cache/rotas | `firebase.json` e docs de deploy |

## Serviços externos durante desenvolvimento

O navegador precisa de rede para baixar Firebase SDK, Adobe Fonts, WeatherWidget e
Google Analytics. Bloqueadores podem gerar erros no console que não representam
falha da lógica central. O widget meteorológico é carregado depois do evento load.

## Configuração de outro Firebase

1. Crie um projeto e uma aplicação Web no Firebase.
2. Ative Authentication > Google.
3. Crie o banco Firestore.
4. Substitua a configuração de `initializeApp`.
5. Atualize `.firebaserc` com o novo project ID.
6. Publique `firestore.rules` antes de testar usuários reais.
7. Adicione localhost e os domínios de preview/produção aos domínios autorizados.

Não compartilhe service accounts. A configuração Web do Firebase pode estar no
cliente; a segurança real é fornecida pelas rules.

## Compatibilidade

O código utiliza APIs modernas como `crypto.randomUUID`, `<dialog>`, `inert`,
`color-mix()` e optional chaining. Já existem fallbacks para ownership de objetos,
UUID e listeners de `MediaQueryList`. Para suportar Safari antigo, adicione outros
fallbacks deliberadamente e teste em dispositivo real; não presuma que uma correção
CSS cobre falhas do JavaScript.
