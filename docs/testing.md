# Estratégia de testes

## Estado atual

O projeto usa Node Test Runner, Playwright e Firebase Emulator Suite. A suíte atual
contém 63 testes unitários/contratuais do cliente, 7 testes do domínio das Functions,
42 E2E em Chromium (21 cenários em desktop e mobile) e 20 testes de
Firestore/Storage Rules. GitHub Actions executa todos em pushes, pull requests e
disparos manuais.

## Checagens rápidas

```bash
npm ci
npm ci --prefix functions
npm run check
npm run test:e2e
npm run test:rules
git diff --check
```

`npm test` executa cliente, Functions e rules em sequência. `npm run test:e2e` é
separado porque instala/usa Chromium e executa Auth, Firestore e Storage Emulator por
meio de `firebase emulators:exec` e `firebase.e2e.json`. Assim os serviços permanecem
ativos durante toda a suíte e são encerrados mesmo se um teste falhar. Java 21+ é
obrigatório para os emuladores Firebase. Os E2E usam Auth 9099, Firestore 8080 e
Storage 9199; as Rules usam a configuração dedicada nas portas 8081 e 9198, de modo
que uma etapa não dependa do encerramento do processo da outra.
O servidor HTTP da matriz usa a porta 4174 e nunca reutiliza um processo existente:
uma colisão interrompe a execução antes dos testes, em vez de servir arquivos de
outro diretório silenciosamente.

## Cobertura automatizada

### Lógica temporal

- decomposição e formatação de intervalos;
- seleção do próximo evento e calendário vencido;
- progresso antes, entre e depois de datas;
- contador fixo válido/inválido;
- recorrência ativa, próxima ocorrência, fim de semana e meia-noite;
- normalização de dias inválidos/duplicados.
- normalização conjunta de calendários, fixos e recorrências para ocorrências;
- ordenação estável e recorrências que atravessam a meia-noite.
- projeção automática da Timeline, próximos marcos por categoria, recorrências,
  fallback, filtros, empate e preservação da data civil local;
- grade mensal/semanal, sobreposição por dia civil e fuso local;
- coordenadas Forecast7, códigos WMO e resposta mínima do Open-Meteo;
- normalização de alertas, início/fim, fontes, silêncio e janela de vencimento.
- materialização server-side no fuso IANA, calendário civil, meia-noite e recuperação
  de execuções agendadas atrasadas.

### Contratos do repositório

- limite cinco alinhado entre HTML, JS e rules;
- catálogo e descrições dos sete backgrounds;
- ordem de carregamento dos scripts;
- compilação do JavaScript inline;
- headers de cache e portas dos emuladores;
- opt-in local dos emuladores e fallbacks Safari;
- calendários ordenados com ao menos uma data futura;
- seed de `generalConfig`, modal com três abas e contrato público/admin;
- links Markdown locais válidos.
- módulos únicos para clima, ocorrências e IDs das seções da dashboard.
- limites de 5 MiB/50 MiB alinhados entre UI, cliente, configuração e Storage Rules.
- contrato de permissão explícita, deduplicação e clique do service worker.
- contrato FID/App Check, scheduler, fila determinística, TTL e configuração das
  Functions.
- marcação, armazenamento de sessão, saída por teclado e cache offline do Modo de
  Foco.
- ação manual, transação, limite e marcação do arquivo de Conquistas.
- camada climática isolada, pausa por visibilidade e bloqueio por reduced motion.

### Firestore Rules

- não autenticado, acesso cruzado e provedor não Google negados;
- perfil/settings válidos aceitos;
- ranges e campos desconhecidos negados;
- schemas fixo/recorrente aceitos;
- cinco permitidos e seis negados;
- nomes, cores, horários e dias inválidos negados;
- documentos fora da allowlist negados;
- arquivo criado vazio, inserção fixa no início e exclusão unitária aceitas;
- recorrentes, mutação do histórico e 101 itens no arquivo negados;
- leitura do proprietário permitida.
- metadados de imagens limitados a dez itens válidos.
- leitura pública de `generalConfig`, escrita exclusiva por administrador Google,
  bloqueio de autoelevação e proteção do documento de expediente.
- layouts, Forecast7 e preferências aninhadas de notificação aceitos somente nos
  formatos e limites conhecidos.
- dispositivos, fila e métricas push negados inclusive ao proprietário.

### Storage Rules

- acesso anônimo, cruzado e por provedor não Google negado;
- imagens conhecidas de até 5 MiB aceitas;
- arquivo maior, SVG e slot fora de 0–9 negados;
- leitura e exclusão permitidas somente ao proprietário.

### Navegador E2E

- visitante, três contadores padrão e persistência do expediente em cookie;
- ausência de overflow horizontal em desktop e viewport de iPhone;
- consentimento negado/aceito antes de carregar Google Analytics;
- Google OAuth por popup contra Auth Emulator, sem conta real;
- concessão local de `isAdmin`, seed e CRUD do modal administrativo;
- criação fixa com início padrão próximo de “agora” e cor própria;
- edição para recorrente, reordenação, toggle, reload e subscriptions;
- arquivamento manual somente de fixos e exclusão permanente da conquista;
- reautenticação e exclusão integral da conta e dos dados conhecidos.
- upload, associação, opacidades e remoção de imagem do card.
- Timeline SVG geral e pessoal, orientação responsiva, filtros, marcadores únicos,
  segmentos recorrentes e abertura do editor.
- condição climática controlada, partículas sem eventos de ponteiro, pausa fora do
  viewport e remoção estrita sob movimento reduzido.
- notificações concedidas, negadas e indisponíveis sem prompt automático.
- Modo de Foco padrão e pessoal, reload da sessão, `Esc`, botão de fechar, reduced
  motion e ausência de overflow em desktop/mobile.

Os E2E usam `demo-timekeeper` e só ativam emuladores com `?emulators=1` em
localhost. Nenhum teste automatizado escreve no projeto Firebase de produção.

Também confira o console do navegador sem filtros. Erros de bloqueadores em Google
Analytics podem ser separados de erros do produto, mas devem ser entendidos.

## Matriz mínima de navegadores

| Plataforma | Cobertura |
| --- | --- |
| Chrome/Edge desktop atual | Fluxo completo e DevTools |
| Firefox desktop atual | Layout, Auth e CSS |
| Safari macOS atual | OAuth, dialog, color-mix e fullscreen |
| Safari iPhone real | Cache, touch, sidebar, popup e canvas |
| Android Chrome | Touch, viewport e desempenho |

Viewports sugeridos: 320, 390, 768, 1024 e 1440 px.

## Checklist funcional

### Visitante

- Página abre sem autenticação.
- Três contadores padrão atualizam a cada segundo.
- Expediente alterna corretamente entre “Ainda faltam” e “Começa em”.
- Hora/minuto mudam imediatamente e persistem após reload.
- Login é apresentado somente como Google.
- Sidebar e contadores pessoais não aparecem.
- Tela cheia funciona onde a API é suportada.

### Autenticação

- Popup permite escolher uma conta Google.
- Cancelar popup mostra mensagem amigável.
- Primeiro login cria perfil, settings, counters, archive e images.
- Login existente não sobrescreve preferências.
- Foto/nome/email aparecem corretamente.
- Logout cancela subscriptions e volta ao horário local dos cookies.

### Configurações ao vivo

- Alterar fim do expediente atualiza o contador e outra aba.
- Cores têm preview durante input e persistem ao concluir.
- Toggle de fundo inicia desligado para conta nova.
- Estilo, cores, velocidade e intensidade sincronizam em outra aba.
- Falha de escrita apresenta erro sem deixar estado enganoso.
- Layout, ordem, cidades e preferências de notificação sincronizam em outra aba.

### Timeline e notificações

- A escala termina no próximo marco mais distante entre as categorias e os filtros
  mostram somente as fontes esperadas, sem overflow.
- Desktop usa eixo horizontal; 320 px e 390 px usam eixo vertical, chamadas legíveis
  e uma única ocorrência para o próximo pagamento e o próximo feriado.
- Eventos simultâneos, ativo e próximo recebem os estados visuais corretos.
- Clicar em contador pessoal abre seu editor; evento geral é somente leitura.
- Alternar para calendário destaca hoje; desktop mostra o mês e 320/390 px mostram
  sete dias da semana atual sem overflow.
- Selecionar um dia abre os eventos filtrados; intervalos de vários dias e
  recorrências noturnas aparecem em todos os dias civis atravessados.
- Permissão só aparece depois de ativar e negar não repete o prompt.
- Horário de silêncio atravessa meia-noite e alteração/exclusão invalida candidatos.
- Duas abas não emitem o mesmo ID de ocorrência e os registros expiram.
- Sem configuração push, a mensagem de entrega limitada permanece visível.
- Com VAPID/App Check configurados, o estado muda para `Push ativo`; foreground,
  background e aplicação fechada recebem uma única notificação.
- Logout revoga o dispositivo, novo login permite recadastro e exclusão da conta
  remove dispositivos/jobs antes do usuário.
- Horário de silêncio gera métrica `suppressed`; FID inválido é revogado; repetição
  do scheduler não duplica o `jobId`.

### Administração

- Usuário sem `isAdmin` não vê a ação de configuração geral.
- Administrador vê o modal com exatamente três abas.
- Coleção vazia recebe o seed uma única vez após o login administrativo.
- Alterar expediente atualiza os contadores padrão em outra aba.
- Adicionar, editar e remover pagamento/feriado atualiza a lista e o card.
- Remover todas as datas de um tipo exibe calendário indisponível sem repopular.
- O modal não cria overflow em 320 px, 390 px, 768 px e desktop.

### Contadores pessoais

- Criação fixa inicia em “agora” e termina 24 h depois por padrão.
- Datas inválidas e fim anterior são rejeitados.
- Recorrente exige ao menos um dia.
- Evento ativo conta até terminar; inativo conta até o próximo início.
- Evento 22:00–06:00 atravessa meia-noite.
- Cor própria muda a barra; sem cor herda o destaque.
- Edição preserva ID, ordem e data de criação.
- Setas respeitam primeiro/último item.
- Exclusão pede confirmação e atualiza outra aba.
- O sexto contador é impedido na UI e pelas rules.
- O botão do header só aparece com ao menos um contador.
- Ocultar/mostrar abre a seção com animação de acordeão.

### Modo de Foco

- Os três cards padrão e todos os cards pessoais exibem uma ação com nome acessível.
- Título, intervalo, progresso e checklist acompanham o card de origem.
- Reload na mesma aba restaura o contador sem mostrar a dashboard primeiro.
- `Esc` e o botão de fechar saem do modo e removem o estado da sessão.
- Excluir o contador em foco ou restaurar um ID obsoleto retorna à dashboard.
- A composição não cria overflow em 320, 390, 768 px ou desktop.
- O fundo ativo não é remontado, o contraste permanece legível e reduced motion
  praticamente elimina a transição.

### Conquistas

- Somente contadores fixos exibem a ação de arquivar.
- Ao chegar a zero, o card fixo revela `Arquivar` no hover/foco e continua acessível
  em telas de toque; recorrentes e fixos em andamento não exibem a ação.
- Cancelar a confirmação preserva o contador ativo; confirmar move o item de forma
  atômica e libera uma vaga entre as cinco.
- O histórico sincroniza entre abas, mantém o mais recente no topo e bloqueia a
  ação quando alcança 100 itens.
- O botão `Arquivados`, abaixo da biblioteca, abre e fecha o modal sem overflow.
- Excluir uma conquista exige confirmação e não restaura o contador ativo.

### Biblioteca de imagens

- Arquivos acima de 5 MiB e tipos não permitidos são rejeitados antes do upload.
- A décima primeira imagem é impedida e a quota mostra até 50 MiB.
- A mesma imagem pode ser escolhida em mais de um contador.
- Opacidades de imagem e sobreposição persistem em outra aba.
- Remover do card preserva a imagem na biblioteca.
- Excluir da biblioteca limpa todos os cards que a referenciam.
- Excluir a conta remove os dez slots do Storage antes de apagar o usuário.

## Checklist visual

- Header e cards mantêm contraste sobre todos os fundos.
- Um, três, quatro e cinco cards não cortam números ou títulos.
- Em desktop, quatro/cinco permanecem na mesma linha.
- Em mobile, todos viram uma coluna sem overflow X.
- Sidebar não cria rolagem horizontal.
- Modais cabem no viewport; biblioteca e campos recorrentes não criam overflow.
- Imagens usam `cover` e o texto mantém contraste em opacidades representativas.
- Weather widgets não piscam branco durante a entrada.
- Entrada da página e acordeão são suaves.
- Anéis cronológicos não dão pop a cada segundo.
- Topografia se move de forma orgânica.
- Constelação mostra estrelas, linhas e halo sem dominar o conteúdo.
- Reduced motion praticamente remove transições e mantém conteúdo acessível.

## Teste de sincronização

Abra duas abas com a mesma conta:

1. Mude uma cor na aba A e confirme na B.
2. Crie um contador na B e confirme na A.
3. Reordene na A enquanto a B está aberta.
4. Desconecte a rede, tente alterar e observe erro/rollback.
5. Reconecte e confirme que snapshots convergem.

Repita isolamento com duas contas: nenhuma deve ler documentos da outra.

## Próxima automação recomendada

Ordem sugerida:

1. Adicionar formatter/lint para HTML, CSS e JS.
2. Capturar screenshots de regressão para os sete backgrounds.
3. Medir desempenho da constelação em viewport móvel.
4. Executar uma matriz complementar em Firefox/WebKit, mantendo iPhone Safari real
   no checklist de release para OAuth e comportamento de cache.
