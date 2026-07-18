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

## Contadores padrão

### Expediente

Evento recorrente de segunda a sexta, das 08:00 até o horário configurado.

- Durante o período: conta quanto falta para terminar.
- Fora do período: conta quanto falta para o próximo início.
- Se o fim for menor ou igual ao início, o algoritmo trata o fim como dia seguinte.

### Pagamento e feriado

Usam listas cronológicas de datas em `public/src/data.js`. O texto conta até a
próxima data e a barra representa a passagem entre dois eventos consecutivos.
As listas precisam ser revisadas a cada ano.
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

## Estados importantes da interface

- `Conectando...`: subscription ainda não entregou dados.
- `Salvando...`: escrita em andamento.
- `Ao vivo` / `Sincronizado`: Firestore é a fonte atual.
- `Erro de conexão`: leitura ou escrita falhou; um toast explica o problema.
- `Limite atingido`: já existem cinco contadores e a criação fica desabilitada.

## Requisitos não funcionais atuais

- Conteúdo principal utilizável a partir de 320 px.
- Atualização dos contadores a cada segundo.
- Respeito à preferência de movimento reduzido.
- Conteúdo do usuário inserido no DOM com APIs seguras.
- Dados de uma conta inacessíveis por outra conta nas regras do Firestore.
