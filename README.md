# Timekeeper

Uma dashboard de contagem regressiva para acompanhar o expediente, pagamentos,
feriados e até cinco contadores no plano Free ou quinze no Premium. O Timekeeper funciona diretamente no
navegador, permite personalização visual e sincroniza os dados da conta em tempo
real com Firebase.

## O que o projeto oferece

- Três contadores padrão: expediente, próximo pagamento e próximo feriado.
- Configuração pública dos contadores padrão sincronizada pelo Firestore.
- Modal administrativo para expediente, pagamentos e feriados.
- Configuração do fim do expediente sem exigir login, persistida em cookie.
- Login e criação de conta exclusivamente pelo Google OAuth.
- Até cinco contadores no plano Free e quinze no Premium, pessoais ou compartilhados em equipe.
- Contadores de período fixo ou eventos recorrentes por dias da semana.
- Criação e edição em modal, exclusão e ordenação por botões.
- Arquivamento manual de contadores fixos e histórico de até 100 conquistas.
- Biblioteca privada com até dez imagens reutilizáveis nos contadores pessoais.
- Opacidade independente da imagem e da sobreposição do card.
- Sincronização ao vivo de configurações, contadores, conquistas e biblioteca com Firestore.
- Duas cores de destaque e sete fundos animados personalizáveis.
- Layout responsivo, tela cheia e respeito a `prefers-reduced-motion`.
- Aplicação instalável com shell offline e atualização controlada.
- Presets, ordem e visibilidade sincronizados para as seções da dashboard.
- Até cinco widgets de clima configuráveis, reordenáveis e sincronizados.
- Atmosferas climáticas por condição real, pausadas fora da tela e sob movimento reduzido.
- Timeline SVG responsiva de expediente, próximos marcos de calendário e contadores pessoais.
- Grade mensal da Timeline com recorte semanal no celular e detalhes por dia.
- Modo de foco imersivo para qualquer contador, restaurado durante a sessão.
- Paisagens sonoras locais no modo de foco, com reprodução sob demanda, volume e loop.
- Notificações locais e push FCM com antecedência, fontes e silêncio configuráveis.

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
├── Cloud Storage (imagens privadas dos contadores)
├── Firebase Cloud Messaging e App Check
└── serviços externos (Adobe Fonts, WeatherWidget, Open-Meteo e Google Analytics)

Cloud Functions (southamerica-east1)
├── cadastro/revogação privada de dispositivos por FID
└── scheduler de um minuto, fila idempotente e métricas agregadas
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
npm ci --prefix functions
firebase emulators:start --only hosting,firestore,auth,storage --project demo-timekeeper
```

Para uma inspeção rápida somente da interface estática, qualquer servidor HTTP
local também funciona. Abrir `public/index.html` diretamente como `file://` não é
recomendado, pois módulos ES e integrações remotas dependem de uma origem HTTP.

Abra `http://127.0.0.1:5000/?emulators=1`. O parâmetro ativa Auth, Firestore e Storage locais
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
│       ├── firebase.js        # Auth, Firestore, Storage, contadores e fundos
│       ├── analytics.js       # Consentimento e carregamento opcional de métricas
│       ├── time.js            # Cálculos temporais compartilhados e testáveis
│       ├── occurrences.js     # Ocorrências derivadas para timeline e alertas
│       ├── weather.js         # Widgets Forecast7 e atmosferas via Open-Meteo
	│       ├── notifications.js   # Candidatos e preferências de alertas locais
	│       ├── soundscapes.js     # Catálogo local e controlador transitório de áudio
	│       ├── focus.js           # Tela imersiva e restauração transitória do contador
│       ├── runtime-config.js  # Chaves públicas VAPID/App Check e região
│       ├── data.js            # Seed/fallback dos calendários públicos
│       ├── style.css          # Design system, layout, responsividade e animações
│       └── *.min.js / assets  # Bibliotecas e recursos locais
├── docs/                      # Documentação detalhada
├── tests/                     # Testes unitários, contratos e Firebase Rules
├── functions/                 # Callables, scheduler FCM e domínio temporal por fuso
├── .github/workflows/ci.yml   # CI para pushes e pull requests
├── package.json               # Ferramentas de teste; não participa do runtime
├── firebase.json              # Hosting, regras e índices
├── firebase.rules-test.json   # Emuladores isolados para testes de Rules
├── firestore.rules            # Autorização e limite de contadores
├── storage.rules              # Imagens privadas, tipos, slots e limites
├── firestore.indexes.json     # Índices do Firestore
└── .firebaserc                # Projeto Firebase padrão
```

## Configuração Firebase

O projeto configurado em `.firebaserc` é `timekeeper-d9a0a`. Para usar outro
projeto, crie-o no Firebase, ative Google como provedor de Authentication, crie o
Firestore, provisione o Storage na região desejada e altere:

1. o alias em `.firebaserc`;
2. o objeto passado a `initializeApp` em `public/src/firebase.js`;
3. os domínios autorizados no Firebase Authentication.

A chave de API presente no frontend identifica o projeto e não é tratada como
segredo. A proteção dos dados depende das regras do Firestore e do Storage, além do
provedor de autenticação. Consulte [Segurança](docs/security.md).

## Validação e publicação

Antes de publicar:

```bash
npm ci
npm run check
npm run test:e2e
npm run test:rules
firebase deploy --only hosting,functions,firestore:rules,firestore:indexes,storage
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
- [Roadmap de produto](roadmap.md)

## Estado atual e limitações conhecidas

- O seed inicial de pagamentos e feriados cobre 2026; depois de inicializada, a
  coleção `generalConfig` pode ser mantida pelo modal administrativo.
- Os assets ainda não possuem nomes com hash, mas o Hosting agora força revalidação
  de todas as respostas para evitar versões misturadas em Safari/iOS.
- O login usa popup. WebViews e Safari com bloqueio de popups podem exigir uma
  estratégia de redirect no futuro.
- As regras validam ownership, provedor Google, allowlist de campos, ranges e os
  schemas fixo/recorrente, inclusive `endAtMs > startAtMs` no servidor.
- A aplicação depende de serviços externos para fonte, clima, SDK Firebase e
  analytics; métricas só carregam após consentimento explícito.
- O fallback local exige que a página/PWA esteja em execução. A entrega com o app
  fechado usa FCM e só é ativada depois de preencher as chaves públicas em
  `runtime-config.js`, configurar App Check e publicar as Functions.
- A CI cobre sintaxe, lógica temporal, contratos/documentação, E2E Chromium em
  desktop/mobile e rules. Ainda faltam um Safari/iPhone real e staging separado.
- A auditoria não encontra vulnerabilidades de produção; a versão atual da
  `firebase-tools` possui advisories moderados em dependências transitivas de dev.

## Contribuindo

Leia [AGENTS.md](AGENTS.md) antes de alterar o projeto. Preserve o funcionamento
sem login, mantenha o limite de cinco alinhado entre interface e regras e teste
qualquer mudança visual com e sem fundos animados.
