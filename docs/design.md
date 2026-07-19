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

### Sidebar e modal

A sidebar ocupa o lado direito, bloqueia interação externa via backdrop/`inert` e
contém rotina, contadores, aparência, clima, notificações e ações da conta no mesmo
fluxo rolável. Sair
precede excluir conta, que encerra o conteúdo. Um `<dialog>` reúne criação e
edição com uma prévia compacta que reage a nome, cor, imagem e opacidades; outro
apresenta upload, quota e biblioteca de imagens em uma grade compacta. A seleção de
cor e imagem compartilha o painel `Visual`; a imagem usa miniatura e ações por ícone
para preservar espaço vertical.

Administradores recebem um terceiro dialog operacional, mais largo, com três abas:
expediente, pagamentos e feriados. A navegação usa sublinhado discreto, o expediente
fica em um formulário curto e os calendários usam listas lineares com ações por
ícone. O expediente e os controles de data ficam em cards semitransparentes. Início,
fim e salvar permanecem na mesma linha; nas datas, campo, salvar e cancelar seguem
o mesmo alinhamento. O conteúdo rolável permanece dentro do modal em telas
pequenas.

Imagens pessoais usam `cover` para ocupar todo o card. A camada de imagem e a
sobreposição na cor da superfície têm opacidades independentes; conteúdo temporal e
barra de progresso permanecem acima de ambas. O botão de remoção aparece no hover ou
foco e fica sempre disponível em telas de toque.

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
