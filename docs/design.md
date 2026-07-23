# Design e experiência

## Direção visual

O Timekeeper usa uma estética escura, editorial e tecnológica. A hierarquia coloca
tempo e progresso acima de ornamentos: títulos são compactos, números usam
monoespaçada e superfícies se tornam translúcidas somente quando há fundo animado.

## Tokens

Os tokens principais vivem em `:root` em `public/src/style.css`.

| Token | Padrão | Uso |
| --- | --- | --- |
| `--bg` | `#0c0b0f` | Fundo geral |
| `--surface` | `#17151c` | Superfícies principais |
| `--surface-2` | `#201d28` | Hover e controles |
| `--line` | `#302c39` | Divisores e bordas |
| `--text` | `#f7f5fa` | Texto primário |
| `--muted` | `#9993a3` | Texto secundário |
| `--accent` | `#a78bfa` | Destaque principal configurável |
| `--accent-secondary` | `#362860` | Destaque secundário configurável |
| `--ambient-a` | `#7c3aed` | Primeira cor do fundo |
| `--ambient-b` | `#0ea5e9` | Segunda cor do fundo |

`applyAccents` atualiza os tokens, barras sem cor própria e atributos dos widgets
de clima. `applyBackground` atualiza tokens ambientes, duração e opacidade.

## Tipografia

- Interface: `caecilia-sans-head`, carregada pelo Adobe Typekit, com fallback
  `system-ui`.
- Números, estados e kickers: `roboto-mono`, também fornecida externamente, com
  fallback `monospace`.
- Ícones: Material Icons em `public/src/material.woff`.

O produto deve permanecer legível quando a fonte externa falhar.

## Layout

### Modo de Foco

A camada imersiva ocupa o viewport sem desmontar `ambient-background`. Em telas
largas, título e tempo formam uma composição editorial horizontal; até 800 px ou em
orientação vertical, o conteúdo passa para uma coluna centralizada. A superfície
escurecida e o `text-shadow` mantêm contraste nos sete fundos, e a cor do contador
é preservada nos detalhes e na barra.

A entrada e a saída usam apenas opacidade e visibilidade. O botão de fechar recebe
foco ao abrir, `Esc` encerra o modo e o foco retorna ao botão de origem quando ele
ainda existe. A regra global de `prefers-reduced-motion` reduz as transições e as
animações do fundo sem esconder conteúdo.

O painel de paisagem sonora ocupa uma faixa compacta abaixo do progresso, com
hierarquia editorial discreta para não competir com o contador. Seus controles
mantêm alvos de toque confortáveis, reorganizam-se em duas colunas até 600 px e
usam a cor do contador apenas como sinal de ação. A seleção inicial é neutra e o
estado pausado fica explícito, evitando surpresa sonora ao entrar no foco.

### Header

Barra de controle fixa com título, horário anônimo ou toggle de contadores, conta e
tela cheia. Permanece visível durante a rolagem e usa transparência e blur para
preservar o contexto sobre qualquer fundo.

### Contadores padrão

Grid desktop em proporção `1.25fr 1fr 1fr`. O expediente é `featured`. Em até
900 px, os cards viram uma coluna.

### Contadores pessoais

- 1–3: três colunas e escala normal em desktop.
- 4: quatro colunas com redução moderada de card e tipografia.
- 5: cinco colunas com redução incremental adicional.
- Até 900 px: uma coluna, independentemente da quantidade.

A seção entra por transição de `grid-template-rows`, margem e opacidade, imitando um
acordeão. O intervalo em relação aos contadores padrão é compacto. Cards mantêm
opacidade suficiente para legibilidade, mas deixam o fundo animado aparecer.

### Layouts da dashboard

Os presets `focus`, `balanced` e `compact` alteram densidade e proporção sem mudar
o conteúdo dos contadores. Usuários autenticados podem reordenar seções por botões
e ocultar seções opcionais; os contadores padrão permanecem sempre disponíveis.
Ordem, visibilidade e preset sincronizam pelo documento de settings.

### Clima dinâmico

Cada `.forecast` contém uma camada `forecast-atmosphere` isolada sobre o iframe e
sem eventos de ponteiro. Sol e noite usam brilho e pontos; nuvens e neblina usam
faixas desfocadas; chuva, neve e tempestade usam no máximo doze partículas. A
opacidade permanece baixa para preservar texto, ícones e controles do fornecedor.

`IntersectionObserver` pausa as animações fora do viewport, `visibilitychange`
pausa a aba oculta e a atualização da condição ocorre a cada quinze minutos. Em
`prefers-reduced-motion: reduce`, a camada inteira usa `display: none`, não apenas
uma animação encurtada. Falhas externas deixam o card na superfície neutra.

### Timeline

A Timeline é uma régua temporal SVG. No desktop, as fontes ocupam trilhas
horizontais; até 700 px, o eixo gira para a vertical e os marcos recebem chamadas
laterais. Expedientes e contadores recorrentes aparecem como segmentos individuais,
enquanto pagamento, feriado e eventos pontuais usam marcadores rotulados. A escala
termina automaticamente no mais distante entre o próximo pagamento, o próximo
feriado e a próxima ocorrência de contador pessoal. Halo indica item ativo ou
próximo, e conflitos preservam uma diferenciação visual discreta. Para evitar alvos
sobrepostos no eixo estreito, a legenda mobile concentra a ação de edição e mantém
cada trilha identificável e acessível por teclado.

Um controle segmentado alterna a régua com uma grade mensal. Cada célula mantém
tags compactas nas cores das fontes, hoje recebe contorno e número preenchido, e
o dia selecionado revela uma lista de detalhes logo abaixo. Até 700 px, a grade
mostra somente a semana atual e transforma as tags em pontos, evitando overflow
em 320 px sem perder os nomes expostos por acessibilidade. O calendário não usa
animação indispensável e herda o comportamento global de movimento reduzido.

### Sidebar e modal

A sidebar ocupa o lado direito, bloqueia interação externa via backdrop/`inert` e
contém rotina, contadores, aparência, clima, notificações e ações da conta no mesmo
fluxo rolável. Abaixo da biblioteca, `Arquivados` abre o histórico fora desse fluxo.
No espaço de uma equipe Premium, a área de contadores também expõe uma lista linear
para criar grupos, definir sua sequência e alternar sua visibilidade. Admins e
editores recebem os controles; viewers veem a lista de contadores sem ações de
escrita.
Sair
precede excluir conta, que encerra o conteúdo. Um `<dialog>` reúne criação e
edição com uma prévia compacta que reage a nome, cor, imagem e opacidades; outro
apresenta upload, quota e biblioteca de imagens em uma grade compacta. Um terceiro
modal apresenta as Conquistas em lista vertical rolável, com estado de sincronização,
quota e exclusão permanente por item. A seleção de
cor e imagem compartilha o painel `Visual`; a imagem usa miniatura e ações por ícone
para preservar espaço vertical.

Cards fixos concluídos revelam a ação de arquivar junto ao botão de foco durante
hover ou foco por teclado. Em dispositivos sem hover, a ação permanece visível;
contadores ainda em andamento e recorrentes não reservam esse controle.

Administradores recebem outro dialog operacional, mais largo, com três abas:
expediente, pagamentos e feriados. A navegação usa sublinhado discreto, o expediente
fica em um formulário curto e os calendários usam listas lineares com ações por
ícone. O expediente e os controles de data ficam em cards semitransparentes. Início,
fim e salvar permanecem na mesma linha; nas datas, campo, salvar e cancelar seguem
o mesmo alinhamento. O conteúdo rolável permanece dentro do modal em telas
pequenas.

Confirmações de ações destrutivas ou irreversíveis usam um `<dialog>` compacto
compartilhado, com título e ação contextual. Cancelamento por botão ou `Esc` não
executa a operação, o foco retorna ao acionador e ações destrutivas recebem destaque
vermelho; arquivar mantém a cor principal por ser uma ação reversível.

Imagens pessoais usam `cover` para ocupar todo o card. A camada de imagem e a
sobreposição na cor da superfície têm opacidades independentes; conteúdo temporal e
barra de progresso permanecem acima de ambas. O botão de remoção aparece no hover ou
foco e fica sempre disponível em telas de toque. No Modo de Foco, as mesmas camadas
e opacidades ocupam a tela inteira atrás do conteúdo. Sem imagem pessoal, a
superfície mais translúcida e com menos desfoque deixa o fundo animado da conta mais
presente, mantendo sombras de texto para contraste.

## Fundos animados

O default é desligado. Todos são configuráveis por cores, velocidade e intensidade.

| Estilo | Implementação | Observações |
| --- | --- | --- |
| Lava lamp | Blobs CSS com gradientes e blur | Formas grandes e orgânicas |
| Blobs flutuantes | Blobs CSS mais definidos | Trajetórias independentes |
| Correntes de vidro | Faixas CSS e backdrop | Superfícies mais translúcidas |
| Anéis cronológicos | Círculos CSS | Delays negativos sincronizam sem pops |
| Aurora orbital | Gradientes alongados CSS | Fluxo horizontal luminoso |
| Mapa topográfico | Paths SVG animados | Contornos intensos e movimento irregular |
| Constelação dinâmica | Canvas 2D | Partículas, conexões, cursor e halos radiais |

Na constelação, a Cor A define estrelas/halos e a Cor B define conexões. A densidade
depende de área e intensidade. O `devicePixelRatio` é limitado a 1.5 para reduzir
custo, e o loop pausa quando o efeito não está ativo ou a página não está visível.

## Movimento

- Entrada da página: fade-in com `translateY`.
- Cards: entrada escalonada.
- Clima: fade com atraso de 1 s para ocultar o flash branco do widget externo;
  os iframes não são transladados e uma máscara inferior na cor da borda cobre
  artefatos de composição do conteúdo externo.
- Seção pessoal: abertura lenta em acordeão.
- Sidebar e modal: transições curtas com curva suave.
- Estados ao vivo: pulso discreto.

Não use atualizações visuais discretas a cada segundo em animações contínuas. O
relógio pode atualizar texto a cada segundo, mas movimento ambiente deve ser
interpolado por CSS ou `requestAnimationFrame`.

## Responsividade

| Faixa | Comportamento |
| --- | --- |
| `> 900px` | Grids horizontais; 4/5 pessoais cabem na mesma linha |
| `<= 900px` | Todos os cards em uma coluna |
| `<= 600px` | Header compacto, textos auxiliares ocultos, formulário em uma coluna |
| mínimo 320px | Limite declarado pelo `body` |

Ao alterar mobile, confira overflow horizontal na sidebar e controles com textos
longos. Touch targets devem continuar fáceis de tocar.

## Acessibilidade

Implementado:

- `lang="pt-BR"`;
- labels e nomes acessíveis em botões de ícone;
- `aria-live` nos contadores e mensagens;
- `aria-hidden`, `aria-expanded`, `aria-pressed` e `inert` nos estados;
- modal nativo e suporte a Escape;
- tabs administrativas com `role="tab"`, `aria-selected`, painéis associados e
  navegação por setas esquerda/direita;
- `prefers-reduced-motion` reduz animações/transições;
- cores de input limitadas ao formato hexadecimal.

Cuidados futuros:

- validar contraste para qualquer cor configurável;
- testar foco retornando ao acionador após fechar sidebar/modal;
- evitar excesso de anúncios de leitores de tela causado por atualização por segundo;
- adicionar fallback visual para `color-mix()` em Safari antigo.

## Checklist de alteração visual

1. Fundos desligados e cada um dos sete fundos ligados.
2. Intensidade mínima/máxima e duas cores claras/escuras.
3. Zero, três, quatro e cinco contadores pessoais.
4. Desktop, tablet e iPhone/Safari.
5. Sidebar aberta sem overflow X.
6. Modais de contador e biblioteca com teclado, upload e remoção.
7. Reduced motion ativo.
