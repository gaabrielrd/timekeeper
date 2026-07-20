# Roadmap de produto

Este documento organiza a implementação de cinco evoluções do Timekeeper: PWA,
layouts da dashboard, personalização dos widgets de clima, timeline e notificações
inteligentes. A ordem prioriza fundações compartilhadas e entregas incrementais,
sem interromper a experiência de visitantes ou a sincronização atual pelo Firebase.

## Princípios

- O uso básico continua funcionando sem conta.
- Recursos pessoais sincronizados exigem Google OAuth e permanecem isolados por UID.
- O runtime publicado continua sem bundler enquanto isso não bloquear uma entrega.
- Novos campos persistidos devem ter defaults seguros, normalização, migração,
  regras, testes e documentação no mesmo trabalho.
- Permissões de instalação e notificação só são solicitadas após uma ação explícita.
- Cada fase deve poder ser publicada e revertida independentemente.
- A interface deve permanecer funcional em 320, 390, 768 px e desktop, inclusive
  com `prefers-reduced-motion`.

## Sequência recomendada

| Fase | Entrega | Dependências | Resultado |
| --- | --- | --- | --- |
| 0 | Fundações | Nenhuma | Contratos e módulos preparados para as novas features |
| 1 | PWA | Fase 0 | Aplicação instalável e shell disponível offline |
| 2 | Layouts da dashboard | Fase 0 | Organização visual persistente por usuário |
| 3 | Widgets de clima | Fases 0 e 2 | Cidades configuráveis, reordenáveis e ocultáveis |
| 4 | Timeline | Fases 0 e 2 | Eventos padrão e pessoais em uma visão cronológica |
| 5A | Notificações locais | Fases 1 e 4 | Alertas enquanto o navegador/PWA puder executar |
| 5B | Push confiável | Fase 5A + backend | Alertas com a aplicação fechada |
| 6 | Mini-Checklists | Fases 0 e 2 | Subtarefas em cards e progresso parcial |
| 7 | Modo de Foco | Fases 0 e 2 | Tela cheia imersiva focada em um único contador com fundo animado |
| 8 | Arquivo & Conquistas | Fases 0 e 2 | Histórico de contadores fixos arquivados manualmente em `/data/archive` |
| 9 | Calendário Mensal | Fases 0, 2 e 4 | Grade visual de calendário para ocorrências da Timeline |
| 10 | Clima Dinâmico | Fases 0, 2 e 3 | Efeitos climáticos (chuva, sol, noite) nos cards de previsão |
| 11 | Plano Premium & Monetização | Fases 0, 2 e 5B | Cotas de IA, 15 contadores, grupos, visibilidade e Stripe Billing |

## Status da execução

- [x] Fase 0 — fundações
- [x] Fase 1 — PWA
- [x] Fase 2 — layouts da dashboard
- [x] Fase 3 — widgets de clima
- [x] Fase 4 — timeline
- [x] Fase 5A — notificações locais
- [x] Fase 5B — push confiável (ativação remota depende de configuração e deploy)
- [ ] Fase 6 — mini-checklists nos contadores
- [x] Fase 7 — modo de foco (zen screen)
- [x] Fase 8 — histórico e arquivo de contadores (conquistas)
- [x] Fase 9 — visualização em grade de calendário
- [x] Fase 10 — clima dinâmico nos cards
- [ ] Fase 11 — plano premium & monetização (em desenvolvimento)

As marcações acima representam implementação, documentação e gates automatizados
concluídos. A validação manual em navegadores e dispositivos reais permanece no
checklist de release. A Fase 5B foi aprovada com Functions em `southamerica-east1`,
fuso por dispositivo, atraso alvo de dois minutos, tentativas por 15 minutos, até
cinco dispositivos, fila por sete dias e métricas agregadas por 30 dias.

### Evidências de validação — 18/07/2026

- `npm run check`: 53/53 testes unitários e contratuais + 7/7 das Functions.
- `npm run test:e2e`: 32/32 cenários em Chromium desktop e mobile, incluindo
  viewports 320/768, shell offline, Auth, duas abas, admin, notificações, clima,
  imagens e exclusão de conta.
- `npm run test:rules`: 15/15 cenários de Firestore e Storage Rules com Java 21.
- `git diff --check`: sem erros de whitespace.
- Os E2E usam `firebase emulators:exec` e configuração dedicada, sem escrita no
  projeto Firebase remoto.

## Fase 0 — Fundações

### Objetivo

Reduzir o acoplamento do script inline antes de adicionar estados e telas que
dependem dos mesmos dados.

### Entregas

- Extrair carregamento e atualização do clima de `public/index.html` para um módulo
  simples em `public/src/`.
- Criar uma camada pura que transforme expediente, pagamentos, feriados e
  contadores pessoais em ocorrências normalizadas.
- Definir IDs estáveis para seções da dashboard: `standard`, `custom`, `timeline`
  e `weather`.
- Centralizar leitura, normalização e aplicação de preferências da dashboard em
  funções pequenas dentro de `public/src/firebase.js`.
- Adicionar contratos automatizados para manifest, service worker e novos campos
  de settings antes de habilitá-los na interface.

### Critérios de aceite

- Os três contadores padrão e widgets atuais permanecem idênticos para visitantes.
- `npm run check`, `npm run test:e2e`, `npm run test:rules` e `git diff --check`
  passam sem novas dependências de runtime.

## Fase 1 — PWA

### Escopo MVP

- Criar `public/manifest.webmanifest` com nome, nome curto, cores, modo
  `standalone`, orientação e ícones 192/512 px, incluindo variante maskable.
- Adicionar metadados de instalação, theme color e ícones ao `public/index.html`.
- Criar `public/sw.js` e registrá-lo somente em origem segura ou localhost.
- Cachear o shell local: HTML, CSS, scripts, fontes locais, ícones e página offline.
- Usar `network-first` para HTML e `stale-while-revalidate` para assets locais.
- Não cachear respostas autenticadas do Firebase, imagens privadas ou dados do
  WeatherWidget como fonte de verdade.
- Exibir atualização disponível com uma ação explícita para recarregar.
- Oferecer instalação somente quando o navegador expuser o evento apropriado;
  esconder o controle onde não houver suporte.

### Arquivos e configuração

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/offline.html`
- `public/src/pwa.js`
- ícones em `public/src/assets/`
- headers do `firebase.json` para manifest e service worker sem cache prolongado

### Critérios de aceite

- Lighthouse reconhece a aplicação como instalável.
- O shell abre offline após uma visita bem-sucedida.
- Login, Firestore e clima mostram estados indisponíveis claros quando offline.
- Uma nova versão do service worker não mantém HTML e CSS incompatíveis.
- Instalação funciona em Chrome/Edge desktop e Android; o fluxo alternativo para
  Safari/iOS fica documentado.

## Fase 2 — Layouts da dashboard

### Escopo MVP

- Oferecer presets `focus`, `balanced` e `compact`.
- Permitir mostrar/ocultar `standard`, `custom`, `timeline` e `weather` quando a
  seção existir e estiver disponível para o usuário.
- Permitir reordenar seções por botões acessíveis; drag and drop pode vir depois.
- Exibir preview no painel de aparência antes de salvar.
- Persistir a escolha em `/users/{uid}/data/settings`.
- Manter o layout padrão para visitantes; opcionalmente guardar um preset local em
  cookie ou `localStorage` numa evolução posterior.

### Schema proposto

```js
{
  dashboardLayout: "balanced",
  dashboardSectionOrder: ["standard", "custom", "weather", "timeline"],
  hiddenDashboardSections: []
}
```

As Rules devem aceitar somente IDs conhecidos, impedir duplicatas, limitar o
tamanho das listas e preservar a allowlist atual de settings.

### Critérios de aceite

- O layout é restaurado sem flash após reload e sincroniza entre duas abas.
- Nenhum preset cria overflow horizontal ou esconde todas as seções essenciais.
- Teclado e leitor de tela conseguem reordenar e identificar o estado das seções.
- Contas antigas recebem `balanced` sem escrita destrutiva.

## Fase 3 — Personalização dos widgets de clima

### Escopo MVP

- Permitir até cinco cidades por usuário, com três cidades iniciais equivalentes às
  atuais.
- Adicionar, editar, remover, ocultar e reordenar cidades.
- Validar URLs/identificadores aceitos pelo WeatherWidget antes de persistir.
- Recriar os widgets com segurança quando cores ou cidades mudarem, removendo
  iframes antigos e evitando scripts duplicados.
- Aplicar cores configuráveis, máscara inferior e fallback visual já existentes.
- Mostrar skeleton durante carregamento e mensagem compacta quando o fornecedor
  externo estiver indisponível.

### Schema proposto

```js
{
  weatherWidgets: [
    {
      id: "uuid",
      label1: "INDAIAL",
      label2: "SANTA CATARINA",
      forecastUrl: "https://forecast7.com/pt/n26d90n49d24/indaial/",
      enabled: true
    }
  ]
}
```

Alternativa preferível após uma investigação curta: persistir coordenadas e gerar
a URL a partir de dados validados, em vez de aceitar uma URL arbitrária. As Rules
devem limitar quantidade e tamanho dos textos, tipos e chaves permitidas.

### Critérios de aceite

- Alterações sincronizam em outra aba e não carregam mais de uma cópia do script.
- Zero widgets exibe estado vazio e não deixa espaço residual.
- Cinco widgets funcionam em desktop e mobile sem linha branca ou overflow.
- URLs externas não autorizadas e campos extras são rejeitados no cliente e Rules.

## Fase 4 — Timeline

### Escopo MVP

- Criar uma seção cronológica que combine:
  - segmentos de todos os expedientes dentro da escala visível;
  - somente o próximo pagamento e o próximo feriado;
  - ocorrências fixas e recorrentes dos contadores pessoais.
- Renderizar a visualização em SVG horizontal no desktop e vertical até 700 px.
- Calcular automaticamente o fim da escala pelo marco mais distante entre o
  próximo pagamento, o próximo feriado e a próxima ocorrência da categoria de
  contadores pessoais. Na ausência desses marcos, usar o próximo expediente.
- Representar intervalos recorrentes como segmentos próprios e eventos pontuais
  como marcadores rotulados, sem despejar todo o calendário na Timeline.
- Permitir filtros por tipo sem alterar a escala temporal calculada para o conjunto.
- Destacar evento em andamento, próximo evento e eventos no mesmo horário.
- Ao selecionar um contador pessoal, abrir seu modal de edição; eventos gerais são
  somente leitura para usuários comuns.
- Derivar a timeline dos snapshots existentes, sem criar uma cópia persistida.

### Modelo normalizado em memória

```js
{
  id: "source-id:occurrence-time",
  sourceId: "source-id",
  sourceType: "workday | payment | holiday | fixed | recurring",
  title: "Pagamento",
  startAtMs: 0,
  endAtMs: null,
  color: null,
  editable: false
}
```

### Critérios de aceite

- A ordenação é estável e correta no fuso local, inclusive em horário de verão.
- Recorrências que atravessam meia-noite aparecem como uma única ocorrência.
- Calendários vazios e períodos sem eventos têm estados claros.
- O SVG não é reconstruído a cada segundo; apenas estados temporais visíveis
  são atualizados.
- Testes unitários cobrem seleção dos próximos marcos, limite automático, filtros,
  empate, recorrência, meia-noite e fallback de expediente.

## Fase 5A — Notificações locais inteligentes

### Escopo MVP

- Adicionar uma central de notificações nas configurações.
- Solicitar permissão somente após o usuário ativar notificações e entender o uso.
- Permitir alertas para:
  - início e fim do expediente;
  - pagamento e feriado;
  - início ou fim de contador pessoal.
- Oferecer antecedências predefinidas: no horário, 5 min, 15 min, 1 h e 1 dia.
- Respeitar fuso local, alterações de dados e preferências de silêncio.
- Usar notificações do service worker quando a aplicação estiver ativa ou o PWA
  ainda puder executar, sem prometer entrega com o navegador encerrado.
- Evitar duplicatas por ocorrência com IDs locais e expiração automática.

### Schema proposto

```js
{
  notificationsEnabled: false,
  notificationLeadMinutes: [15],
  notificationSources: {
    workday: true,
    payment: true,
    holiday: true,
    counters: true
  },
  notificationQuietHours: {
    enabled: false,
    startTime: "22:00",
    endTime: "07:00"
  }
}
```

### Critérios de aceite

- Negar permissão não bloqueia o app nem causa novos prompts automáticos.
- Alterar ou excluir um evento invalida alertas locais pendentes.
- A mesma ocorrência não notifica duas vezes em reload ou múltiplas abas.
- A UI diferencia claramente `não suportado`, `não autorizado`, `ativo` e
  `entrega limitada`.

## Fase 5B — Push confiável com a aplicação fechada

Esta fase foi aprovada e implementada. As decisões de região, custo, schema,
operação e ativação estão em
[`docs/push-architecture.md`](docs/push-architecture.md).

### Componentes necessários

- Firebase Cloud Messaging com Firebase Installation IDs (FID).
- Cloud Functions de 2ª geração para cadastrar dispositivos e despachar alertas.
- Cloud Scheduler para processar próximos eventos.
- Coleção privada de dispositivos e fila de notificações com regras restritas.
- App Check, limites de frequência, limpeza de FIDs inválidos e observabilidade.
- Política de privacidade atualizada para explicar FIDs e processamento.

### Decisões adotadas

- Região `southamerica-east1` e um job do Scheduler a cada minuto.
- Horários civis calculados no fuso IANA salvo por dispositivo.
- Entrega *best effort*, atraso alvo de dois minutos e tentativas por 15 minutos.
- Até cinco dispositivos, revogação no logout e remoção na exclusão da conta.
- Fila idempotente retida por sete dias e métricas agregadas por 30 dias via TTL.

### Critérios de aceite

- Alertas chegam com o app fechado nas plataformas suportadas.
- FIDs são privados, atualizados pelo callback do SDK e removidos no
  logout/exclusão da conta.
- Reprocessamento é idempotente e não cria notificações duplicadas.
- Métricas mostram agendado, enviado, inválido e falha sem registrar conteúdo
  sensível desnecessário.

## Fase 6 — Mini-Checklists nos contadores

### Objetivo
Permitir que usuários autenticados definam subtarefas nos contadores pessoais, exibindo progresso tanto temporal quanto de metas concluídas diretamente no card.

### Escopo MVP
- Permitir criar e ordenar até 3 subtarefas por contador pessoal no modal de edição.
- Exibir checkboxes de status nos cards e barras de progresso parcial de conclusão.
- Persistir a lista de tarefas como um array estruturado no próprio item do contador.
- Permitir marcar/desmarcar subtarefas diretamente na UI do card (otimista, com sincronização em tempo real).

### Critérios de aceite
- O limite máximo de 3 subtarefas por contador é validado no cliente e nas Firestore Rules.
- A barra de progresso do card se adapta elegantemente para mostrar o percentual do tempo e o progresso das tarefas concluídas.
- As subtarefas mantêm seu estado de sincronização e ordenação entre abas.

## Fase 7 — Modo de Foco (Zen Screen)

### Objetivo
Oferecer uma visualização em tela cheia de um contador selecionado, integrando-o ao fundo animado para criar uma experiência temporal imersiva livre de distrações.

### Escopo MVP
- Adicionar um botão de "Modo de Foco" (ícone ou link discreto) no cabeçalho do card de qualquer contador.
- Esconder toda a dashboard e centralizar o contador selecionado com tipografia editorial em tamanho extra grande.
- Integrar a movimentação e partículas do fundo animado ativo, aplicando contraste apropriado às cores do texto.
- Persistir a preferência da seção em foco em cookies locais ou transientemente em sessão para restaurar em caso de reload.
- Sair do modo de foco pressionando a tecla `ESC` ou clicando em um botão discreto de fechar.

### Critérios de aceite
- O layout do Modo de Foco adapta-se perfeitamente para viewports mobile (vertical) e desktop (horizontal/telas secundárias).
- Transições de entrada e saída do Modo de Foco ocorrem sem flashes ou pops de animação, respeitando a configuração de reduced motion.

## Fase 8 — Histórico e Arquivo de Contadores (Conquistas)

### Objetivo
Implementar o arquivamento manual de contadores fixos para manter o painel de contadores ativos limpo, sem perder o registro histórico das metas.

### Escopo MVP
- Permitir mover um contador fixo para o arquivo (`/users/{uid}/data/archive`) somente por ação manual do usuário e após confirmação.
- Adicionar um painel / histórico de "Conquistas" na biblioteca ou configurações onde o usuário possa rever as últimas 100 metas concluídas.
- Exibir a data e hora em que a meta foi alcançada.
- Permitir excluir permanentemente itens do arquivo.

### Critérios de aceite
- As Firestore Rules limitam o arquivo a no máximo 100 itens por usuário para preservar o limite de armazenamento.
- A migração de um contador ativo para o arquivo libera instantaneamente o budget para a criação de um novo contador ativo (mantendo o limite de 5 ativos).
- Contadores recorrentes não exibem a ação de arquivar e nenhum contador é arquivado automaticamente ao atingir 100%.

## Fase 9 — Visualização em Grade de Calendário

### Objetivo
Expandir as visualizações temporais da seção *Timeline* permitindo alternar de uma representação linear para uma grade clássica de calendário mensal/semanal.

### Escopo MVP
- Adicionar um seletor visual na Timeline para alternar entre "Lista Linear" e "Calendário Mensal".
- Renderizar uma grade de calendário do mês corrente com o dia de hoje destacado.
- Indicar os marcos temporais (expediente, pagamentos, feriados, contadores ativos) com pequenas tags de texto ou pontos de cores correspondentes no dia correto.
- Permitir abrir os detalhes de um evento ao clicar no respectivo dia.

### Critérios de aceite
- A grade de calendário permanece responsiva de 320 px a desktop, reduzindo para visualização semanal ou lista compacta em celulares.
- O cálculo e a renderização das datas do calendário utilizam o fuso horário local do dispositivo do usuário.
- A troca de visualização e a seleção do dia são estados transitórios; nenhuma cópia das ocorrências é persistida.

## Fase 10 — Clima Dinâmico nos Cards

### Objetivo
Aumentar a excelência visual dos widgets de clima, estilizando dinamicamente os backgrounds dos cards com micropartículas e atmosferas baseadas nas condições de tempo reais fornecidas pela API.

### Escopo MVP
- Mapear a condição do clima retornada pelo Forecast7 (ex: limpo, chuvoso, nublado, tempestade).
- Gerar efeitos em CSS/canvas leves aplicados exclusivamente dentro do card da respectiva cidade (ex: gotas de chuva suaves caindo, névoa oscilante, estrelas brilhando à noite).
- Otimizar o desempenho visual para que as animações de clima consumam pouca CPU/GPU e fiquem em pausa quando o card não estiver visível no viewport.

### Critérios de aceite
- Respeita o `prefers-reduced-motion` desativando as micropartículas de forma estrita.
- Os cards mantêm o contraste de texto e a visibilidade dos controles de edição/exclusão sob qualquer efeito climático.
- A condição usa somente coordenadas já presentes na URL Forecast7 e não adiciona campos persistidos ou chaves privadas.

## Fase 11 — Plano Premium, Cotas de IA & Monetização

### Objetivo
Introduzir o Plano Premium no Timekeeper, expandindo capacidades para usuários pagantes (até 15 contadores, 40 imagens IA/mês, agrupamento de contadores e visibilidade individual) mantendo o Plano Free funcional com limites claros (5 contadores, 8 gerações IA vitalícias), sincronizado via Stripe Billing em BRL.

### Escopo MVP
- **Cotas de IA**: Usuários Free logados possuem 8 gerações de IA no total; usuários Premium possuem 40 gerações por mês com renovação automática.
- **Limites & Grupos de Contadores**: Usuários Premium podem criar até 15 contadores e organizá-los em grupos/tags customizados.
- **Visibilidade Individual**: Usuários Premium podem marcar contadores como ocultos da dashboard sem excluí-los.
- **Stripe Billing Integration**: Integração com Stripe Checkout e Customer Portal em BRL via Cloud Functions Webhook.

### Critérios de aceite
- O uso básico sem conta continua funcional sem alterações.
- Regras do Firestore (`firestore.rules`) garantem os limites de 5 e 15 contadores baseados no `tier` validado no servidor.
- O campo `tier` só pode ser alterado por administradores ou webhooks autenticados do Stripe (Cloud Functions).
- Todos os testes de regras e contratos continuam passando.

## Testes transversais

### Unitários e contratos

- Normalização de layouts, cidades, ocorrências e preferências.
- Manifest, ícones e service worker referenciados por caminhos válidos.
- Estratégias de cache não incluem documentos privados ou endpoints Firebase.
- Novos defaults permanecem alinhados com HTML, cliente, Rules e documentação.

### Firestore Rules

- Aceitar schemas válidos e rejeitar campos extras, listas excessivas, IDs
  desconhecidos, URLs inválidas e configurações cruzadas entre usuários.
- Preservar Google OAuth, propriedade por UID e proteção de `isAdmin`.

### E2E

- Instalação/shell offline e atualização do service worker.
- Troca de layout, reload e sincronização em duas abas.
- CRUD e reordenação de cidades em desktop/mobile.
- Timeline com eventos gerais, fixos, recorrentes e calendários vazios.
- Fluxos de permissão de notificação concedida, negada e indisponível.
- Logout e exclusão de conta removem dados locais, subscriptions e tokens aplicáveis.

### Validação manual

- Chrome/Edge desktop, Android Chrome, Safari macOS e iPhone real.
- Online, offline, rede lenta, aba em segundo plano e PWA standalone.
- Fusos diferentes, virada do dia e mudança de horário do sistema.
- Fundos desligados/ligados, reduced motion e todos os breakpoints suportados.

## Estratégia de lançamento

1. Publicar cada fase atrás de uma constante local ou flag de UI removível.
2. Validar primeiro no projeto Firebase de staging recomendado pela arquitetura.
3. Migrar settings por leitura tolerante; não fazer migração destrutiva em massa.
4. Publicar Hosting e Rules juntos sempre que o schema mudar.
5. Monitorar erros, cache do service worker e falhas do fornecedor de clima.
6. Remover a flag somente após validação em duas abas, offline e dispositivos reais.

## Definição de pronto

Uma fase só está concluída quando código, Rules, documentação, acessibilidade,
telemetria consentida e testes estão alinhados; o fluxo visitante continua
funcional; e existe um caminho claro de rollback sem perda de dados.
