# Timekeeper

Uma dashboard de contagem regressiva para acompanhar o expediente, pagamentos,
feriados e até cinco contadores pessoais. O Timekeeper funciona diretamente no
navegador, permite personalização visual e sincroniza os dados da conta em tempo
real com Firebase.

## O que o projeto oferece

- Três contadores padrão: expediente, próximo pagamento e próximo feriado.
- Configuração do fim do expediente sem exigir login, persistida em cookie.
- Login e criação de conta exclusivamente pelo Google OAuth.
- Até cinco contadores pessoais por conta.
- Contadores de período fixo ou eventos recorrentes por dias da semana.
- Criação e edição em modal, exclusão e ordenação por botões.
- Sincronização ao vivo de configurações e contadores com Firestore.
- Duas cores de destaque e sete fundos animados personalizáveis.
- Layout responsivo, tela cheia e respeito a `prefers-reduced-motion`.
- Widgets de previsão do tempo para Indaial, Maringá e São Paulo.

## Visão rápida

O runtime é uma aplicação web estática: não há framework, bundler ou etapa de
build. O Firebase SDK é importado como módulo ES diretamente do CDN. O
`package.json` existe somente para testes, emuladores e automação de qualidade.

```text
Navegador
├── HTML e CSS estáticos
├── contadores padrão e cookies locais
├── Firebase Authentication (Google)
├── Cloud Firestore (dados em tempo real)
└── serviços externos (Adobe Fonts, WeatherWidget e Google Analytics)
```

## Como executar localmente

Pré-requisitos:

- um navegador moderno;
- Node.js 22 ou superior;
- Java 21 ou superior, exigido pelo emulador Firestore;
- Firebase CLI autenticada somente caso queira publicar.

Na raiz do projeto:

```bash
npm ci
firebase emulators:start --only hosting,firestore,auth --project demo-timekeeper
```

Para uma inspeção rápida somente da interface estática, qualquer servidor HTTP
local também funciona. Abrir `public/index.html` diretamente como `file://` não é
recomendado, pois módulos ES e integrações remotas dependem de uma origem HTTP.

Abra `http://127.0.0.1:5000/?emulators=1`. O parâmetro ativa Auth e Firestore locais
somente em `localhost`/`127.0.0.1`; sem ele, o cliente continua usando o Firebase
configurado. Veja [Desenvolvimento](docs/development.md).

## Estrutura

```text
.
├── public/
│   ├── index.html             # Estrutura, contadores padrão e runtime legado
│   ├── privacy.html           # Política e controles de privacidade
│   ├── 404.html               # Página 404 padrão do Firebase
│   └── src/
│       ├── firebase.js        # Auth, Firestore, contadores pessoais e fundos
│       ├── analytics.js       # Consentimento e carregamento opcional de métricas
│       ├── time.js            # Cálculos temporais compartilhados e testáveis
│       ├── data.js            # Datas anuais de pagamentos e feriados
│       ├── style.css          # Design system, layout, responsividade e animações
│       └── *.min.js / assets  # Bibliotecas e recursos locais
├── docs/                      # Documentação detalhada
├── tests/                     # Testes unitários, contratos e Firestore Rules
├── .github/workflows/ci.yml   # CI para pushes e pull requests
├── package.json               # Ferramentas de teste; não participa do runtime
├── firebase.json              # Hosting, regras e índices
├── firestore.rules            # Autorização e limite de contadores
├── firestore.indexes.json     # Índices do Firestore
└── .firebaserc                # Projeto Firebase padrão
```

## Configuração Firebase

O projeto configurado em `.firebaserc` é `timekeeper-d9a0a`. Para usar outro
projeto, crie-o no Firebase, ative Google como provedor de Authentication, crie o
Firestore e altere:

1. o alias em `.firebaserc`;
2. o objeto passado a `initializeApp` em `public/src/firebase.js`;
3. os domínios autorizados no Firebase Authentication.

A chave de API presente no frontend identifica o projeto e não é tratada como
segredo. A proteção dos dados depende das regras do Firestore e do provedor de
autenticação. Consulte [Segurança](docs/security.md).

## Validação e publicação

Antes de publicar:

```bash
npm ci
npm run check
npm run test:e2e
npm run test:rules
firebase deploy --only hosting,firestore:rules
```

Faça também o checklist manual descrito em [Testes](docs/testing.md), incluindo
desktop, iPhone/Safari, login Google, atualização entre duas abas e os sete fundos.

## Documentação

O índice completo está em [docs/README.md](docs/README.md). Comece por:

- [Produto e comportamento](docs/product.md)
- [Arquitetura](docs/architecture.md)
- [Design e movimento](docs/design.md)
- [Modelo de dados](docs/data-model.md)
- [Desenvolvimento](docs/development.md)
- [Deploy](docs/deployment.md)
- [Segurança](docs/security.md)
- [Testes](docs/testing.md)
- [Manutenção](docs/maintenance.md)
- [Troubleshooting](docs/troubleshooting.md)

## Estado atual e limitações conhecidas

- Pagamentos e feriados estão cadastrados manualmente para 2026 em `data.js`.
- Os assets ainda não possuem nomes com hash, mas o Hosting agora força revalidação
  de todas as respostas para evitar versões misturadas em Safari/iOS.
- O login usa popup. WebViews e Safari com bloqueio de popups podem exigir uma
  estratégia de redirect no futuro.
- As regras validam ownership, provedor Google, allowlist de campos, ranges e os
  schemas fixo/recorrente, inclusive `endAtMs > startAtMs` no servidor.
- A aplicação depende de serviços externos para fonte, clima, SDK Firebase e
  analytics; métricas só carregam após consentimento explícito.
- A CI cobre sintaxe, lógica temporal, contratos/documentação, E2E Chromium em
  desktop/mobile e rules. Ainda faltam um Safari/iPhone real e staging separado.
- A auditoria não encontra vulnerabilidades de produção; a versão atual da
  `firebase-tools` possui advisories moderados em dependências transitivas de dev.

## Contribuindo

Leia [AGENTS.md](AGENTS.md) antes de alterar o projeto. Preserve o funcionamento
sem login, mantenha o limite de cinco alinhado entre interface e regras e teste
qualquer mudança visual com e sem fundos animados.
