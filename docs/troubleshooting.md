# Troubleshooting

## No celular ainda aparece limite de três

O código atual usa cinco e não há regra mobile que reduza esse número. O sintoma
indica versão antiga ou mistura de HTML/JS/CSS em cache.

1. Abra o site em aba privada.
2. Confira se a sidebar mostra `0 / 5`.
3. Se continuar `0 / 3`, confirme que Hosting foi publicado.
4. Se privado funciona, apague os dados desse site no Safari.
5. No desktop, inspecione Network e confirme a versão de `firebase.js`.

Fechar/reabrir a aba pode não invalidar recursos no iOS. Veja [Deploy](deployment.md#cache).
As configurações atuais do Hosting forçam revalidação, mas só passam a valer depois
de um novo deploy de Hosting.

## A preferência de background sincroniza, mas não muda na aba atual

Isso significa que a escrita do Firestore funcionou, mas a camada visual não aplicou
o estado. Causas comuns:

- CSS ou JS antigo em cache;
- exceção JavaScript antes de `applyBackground`;
- recurso CSS não suportado pelo Safari antigo (`color-mix`, por exemplo);
- canvas com dimensões/loop não sincronizados após resize;
- fundo está desativado apesar de o estilo ter mudado.

Teste outra aba/dispositivo, confira `data-background-enabled` e
`data-background-style` no `<body>` e observe o console. Se outra aba muda ao vivo,
Firestore e subscription estão saudáveis; investigue runtime/CSS local.

## Login Google falha

| Erro/sintoma | Causa provável | Ação |
| --- | --- | --- |
| `auth/popup-blocked` | Navegador bloqueou popup | Permitir popups ou adotar redirect |
| `auth/popup-closed-by-user` | Usuário fechou | Tentar novamente |
| `auth/operation-not-allowed` | Google desativado | Ativar provedor no Firebase Console |
| `auth/unauthorized-domain` | Domínio não autorizado | Adicionar em Authentication settings |
| Popup abre e fecha no iOS | Política Safari/WebView | Testar Safari normal e redirect fallback |

Também confira se `authDomain` e `projectId` em `firebase.js` pertencem ao mesmo
projeto e se bloqueadores não interrompem scripts Google.

## “Missing or insufficient permissions”

Confirme:

- usuário autenticado via Google;
- path usa exatamente o UID atual;
- documento é `settings` ou `counters`;
- `items` é lista com no máximo cinco;
- rules atualizadas foram publicadas no projeto correto.

Hosting e Firestore Rules têm deploys independentes.

## Configuração volta ao valor anterior

Pode ser rollback após falha de escrita ou snapshot de outra aba. Abra o console,
observe `Erro ao salvar` e teste a conexão. Como contadores são um array completo,
duas edições simultâneas podem resultar em last-write-wins.

## Contador recorrente mostra ciclo inesperado

- Verifique o fuso/relógio do dispositivo.
- Confirme a convenção dos dias: domingo 0, segunda 1, ..., sábado 6.
- Se o fim é menor/igual ao início, o evento atravessa meia-noite.
- O dia selecionado representa o dia em que a ocorrência começa.

## Pagamento ou feriado fica zerado

As listas em `data.js` provavelmente venceram ou não estão em ordem. Quando não há
data futura, o runtime usa o último item e o intervalo é limitado a zero. Atualize o
calendário conforme [Manutenção](maintenance.md).

## Widget meteorológico pisca branco ou não carrega

O CSS atrasa a entrada da seção em 1 s e o script é inserido após `window.load`.
Se continuar branco:

- confira bloqueadores/CSP/rede;
- verifique a resposta de `weatherwidget.io`;
- confirme os atributos `data-*` do link;
- teste sem extensões em janela privada.

Falha do widget não deve impedir os contadores.

## Sidebar cria overflow horizontal

Teste a largura de 320/390 px e procure filhos com largura fixa, `white-space:
nowrap` ou grids sem `minmax(0, 1fr)`. Inspecione o elemento que excede
`document.documentElement.clientWidth`; não esconda o problema somente com
`overflow-x: hidden` se controles estiverem sendo cortados.

## Constelação está pesada

- Reduza intensidade, que também reduz quantidade de partículas.
- Teste reduced motion, que desenha um frame estático.
- Confirme que o loop pausa ao trocar de estilo ou ocultar a aba.
- Mantenha o limite de DPR e evite alocações extras por partícula sem medir.

## Diagnóstico rápido pós-deploy

1. Janela privada.
2. Console sem exceções.
3. Network sem CSS/JS antigos.
4. Login Google.
5. Settings e counters recebendo snapshots.
6. Uma alteração confirmada em outra aba.
7. Teste em mobile real.
