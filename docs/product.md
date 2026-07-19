# Produto e comportamento

## Proposta

O Timekeeper transforma marcos de tempo em uma dashboard consultável em poucos
segundos. A experiência anônima resolve o acompanhamento do expediente. A conta
Google adiciona continuidade entre dispositivos, contadores pessoais e expressão
visual.

## Perfis de uso

### Visitante

Pode:

- acompanhar expediente, pagamento e feriado;
- definir a hora/minuto de encerramento do expediente;
- usar tela cheia e consultar o clima.
- abrir qualquer contador padrão no Modo de Foco.

O horário fica salvo nos cookies `hourTime` e `minutesTime` por 365 dias. Não pode
criar contadores nem personalizar aparência.

### Usuário autenticado

Entra somente com uma conta Google. Além do uso básico, pode:

- gerenciar até cinco contadores;
- ordenar, editar, excluir, mostrar ou ocultar seus contadores;
- configurar expediente na sidebar;
- alterar duas cores de destaque;
- ativar e configurar fundos animados;
- enviar e reutilizar imagens de fundo nos contadores pessoais.

Configurações e contadores são sincronizados em tempo real pelo Firestore.

### Administrador

Um usuário cujo perfil contém `isAdmin: true` recebe a ação “Configuração geral”
no menu da conta. O modal administrativo possui três abas e permite:

- definir horários e dias do expediente padrão;
- adicionar, editar e remover datas de pagamento;
- adicionar, editar e remover datas de feriado.

A flag não pode ser concedida pelo próprio cliente e deve ser administrada por um
operador privilegiado no Firebase.

## Contadores padrão

### Expediente

Evento recorrente nos dias e a partir do horário inicial definidos na configuração
geral. O horário final global é o padrão; visitantes e usuários autenticados ainda
podem manter seu próprio horário final.

- Durante o período: conta quanto falta para terminar.
- Fora do período: conta quanto falta para o próximo início.
- Se o fim for menor ou igual ao início, o algoritmo trata o fim como dia seguinte.

### Pagamento e feriado

Usam documentos públicos da coleção `generalConfig`. O texto conta até a próxima
data e a barra representa a passagem entre dois eventos consecutivos. `data.js`
mantém somente o seed/fallback usado antes da primeira inicialização remota.
As listas precisam ser revisadas a cada ano pelo modal administrativo.
Quando não existe data futura, o card mostra “Calendário indisponível” em vez de
permanecer silenciosamente preso ao último evento.

## Contadores pessoais

### Período fixo

- Nome obrigatório, até 50 caracteres.
- Início padrão: agora, sem segundos.
- Fim padrão: 24 horas após o início.
- O fim deve ser posterior ao início.
- Enquanto o evento não termina, conta até o fim e calcula progresso entre início/fim.

### Evento recorrente

- Nome, hora inicial, hora final e pelo menos um dia da semana.
- Dias usam a convenção JavaScript: domingo `0` até sábado `6`.
- Durante uma ocorrência, conta até o fim.
- Fora dela, conta até o próximo ciclo.
- Intervalos noturnos, como 22:00–06:00, atravessam a meia-noite.

Ambos podem ter uma cor própria. Sem cor, usam o destaque principal da interface.

## Gerenciamento

- A criação e edição acontecem no mesmo modal.
- Reordenação usa botões de seta para cima/baixo.
- Exclusão exige confirmação.
- O botão “Meus contadores” só aparece no header quando existe ao menos um.
- A seção abre/fecha como acordeão e a preferência é sincronizada.
- Operações de exclusão e ordenação atualizam a UI primeiro e fazem rollback se o
  Firestore rejeitar a escrita.
- Cada card pode usar uma imagem da biblioteca, com opacidade da imagem e da
  sobreposição ajustáveis separadamente.
- A imagem pode ser removida no editor ou diretamente pelo botão do card.
- A biblioteca aceita até dez arquivos de 5 MiB; excluir um remove seu uso em todos
  os contadores sem excluir os próprios contadores.

## Aparência

O fundo animado começa desligado. Quando ativado, o usuário escolhe:

- estilo;
- duas cores ambientes;
- velocidade entre 20 e 100;
- intensidade entre 15 e 100.

Estilos atuais: lava lamp, blobs flutuantes, correntes de vidro, anéis
cronológicos, aurora orbital, mapa topográfico e constelação dinâmica.

Usuários autenticados também escolhem entre layouts `focus`, `balanced` e
`compact`, reordenam as seções disponíveis e ocultam áreas opcionais. Os contadores
padrão não podem ser ocultados. Essas preferências sincronizam entre abas.

## Previsão do tempo

Os widgets Forecast7 mantêm até cinco cidades configuráveis. Cada card usa as
coordenadas já codificadas em sua URL para consultar apenas `weather_code` e
`is_day` no Open-Meteo. A condição atual seleciona uma atmosfera discreta de sol,
noite, nuvens, neblina, chuva, neve ou tempestade sem substituir a previsão.

As partículas não recebem interação, pausam assim que o card sai do viewport ou a
aba fica oculta e desaparecem estritamente sob `prefers-reduced-motion`. Falha na
consulta da condição remove somente a atmosfera; o Forecast7 continua sendo o
conteúdo principal do card.

## Timeline

A seção Timeline combina expediente, pagamentos, feriados e ocorrências fixas ou
recorrentes em um SVG horizontal no desktop e vertical no mobile. A escala começa
em agora e termina no mais distante entre o próximo pagamento, o próximo feriado e
a próxima ocorrência da categoria de contadores pessoais; datas posteriores do
mesmo calendário não são exibidas. Intervalos recorrentes aparecem como segmentos
próprios, eventos pontuais como marcadores rotulados, e o filtro por origem não muda
o alcance calculado. Itens pessoais abrem o editor do contador; eventos gerais
permanecem somente leitura.

O seletor da seção alterna essa régua com o Calendário mensal. A grade usa o mês
corrente, destaca hoje e distribui expediente, pagamentos, feriados e contadores
pelos dias civis em que cada ocorrência está ativa. Selecionar um dia abre seu
detalhamento; contadores pessoais continuam levando ao editor. Em telas de até
700 px, o calendário reduz para a semana atual, mantendo os mesmos filtros. A
visualização e o dia selecionado são estados transitórios e não são sincronizados.

## Notificações locais e push

Usuários autenticados podem ativar alertas no dispositivo, escolher fontes,
antecedências de 0 a 1.440 minutos e um intervalo de silêncio. A permissão do
navegador só é solicitada no toggle de ativação. A UI diferencia não autorizado,
bloqueado, não suportado, local e `Push ativo`. Quando VAPID e App Check estão
configurados, o mesmo dispositivo recebe alertas pelo FCM com a aplicação fechada
nas plataformas Web Push suportadas. Sem essa configuração, o fallback exige que a
página/PWA ainda possa executar. Negar permissão não gera prompts automáticos.

Até cinco dispositivos podem ser registrados por conta. Logout revoga a instalação
atual; excluir a conta remove dispositivos e jobs. O horário de silêncio é calculado
no fuso de cada dispositivo.

## Instalação e modo offline

Em navegadores compatíveis, o Timekeeper pode ser instalado como PWA após uma ação
explícita. Uma visita online prepara o shell local para reabrir a interface offline;
Firebase e previsão do tempo continuam dependentes de conexão e mostram estados
de indisponibilidade. Atualizações aguardam confirmação antes de recarregar.

## Modo de Foco

Qualquer card de contador possui uma ação discreta para abrir uma visualização que
ocupa todo o viewport. Ela mantém o fundo animado ativo, amplia título, intervalo e
progresso e, nos contadores pessoais, também mostra o estado do mini-checklist. O
layout distribui título e tempo lado a lado em telas largas e passa para uma coluna
em mobile ou orientação vertical.

O ID do contador em foco fica somente em `sessionStorage`, na chave
`timekeeper:focus-counter`. Um reload na mesma aba restaura a visualização; fechar
a aba encerra a preferência. Se um contador pessoal não estiver mais disponível, o
estado transitório expira sem bloquear a dashboard. O usuário sai pelo botão de
fechar ou pela tecla `Esc`.

## Estados importantes da interface

- `Conectando...`: subscription ainda não entregou dados.
- `Salvando...`: escrita em andamento.
- `Ao vivo` / `Sincronizado`: Firestore é a fonte atual.
- `Erro de conexão`: leitura ou escrita falhou; um toast explica o problema.
- `Limite atingido`: já existem cinco contadores e a criação fica desabilitada.

## Histórico e Arquivo de Contadores (Conquistas)

Contadores fixos exibem a ação de arquivar na lista de gerenciamento. O movimento
só acontece após interação e confirmação explícitas; atingir 100% não altera o
contador automaticamente. Quando a contagem chega a zero, o card também revela a
ação de arquivar no hover ou foco; em telas de toque, ela permanece visível. A
transação remove o item da lista ativa e o adiciona ao
histórico, liberando imediatamente uma das cinco vagas.

O botão `Arquivados`, logo abaixo de `Biblioteca de imagens`, abre o modal
`Conquistas`. Ele mantém até 100 itens, ordenados do arquivamento mais recente ao
mais antigo, e mostra nome, data e hora da ação e resumo do checklist. Cada item
pode ser excluído permanentemente após uma nova confirmação. Contadores recorrentes
não podem ser arquivados.

## Evoluções da V2

### Mini-Checklists nos Contadores
Cada contador pessoal suporta a adição de até 3 subtarefas (checkpoints) em formato de lista interativa. A conclusão de cada subtarefa atualiza o progresso parcial no card de forma complementar ao progresso temporal. A interface atualiza o estado de forma otimista e sincroniza as edições em tempo real.

## Requisitos não funcionais atuais

- Conteúdo principal utilizável a partir de 320 px.
- Atualização dos contadores a cada segundo.
- Respeito à preferência de movimento reduzido.
- Conteúdo do usuário inserido no DOM com APIs seguras.
- Dados de uma conta inacessíveis por outra conta nas regras do Firestore.
