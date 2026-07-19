# Manutenção

## Rotina anual obrigatória

`generalConfig` é a fonte ao vivo dos calendários, enquanto `public/src/data.js`
continua sendo o seed/fallback de uma instalação vazia. Antes da virada do ano:

1. confirme a política de pagamento e os feriados desejados;
2. adicione/edite as datas ao vivo pelo modal administrativo;
3. replique o calendário em `data.js` para manter o fallback atualizado;
4. mantenha arrays e documentos estritamente em ordem crescente;
5. use horários locais explícitos para evitar mudança involuntária de data;
6. teste dezembro do ano atual e janeiro do próximo com relógio simulado;
7. publique o fallback antes da última data cadastrada.

Quando todas as datas já passaram, `findNext` devolve `null` e o card mostra
“Calendário indisponível”. Isso deve ser tratado como sinal operacional de
calendário vencido.

## Revisão periódica

### Mensal

- Consultar uso/custos de Firestore, Hosting e Auth.
- Conferir erros de login e permissions no console.
- Validar widget de clima, condição Open-Meteo e fontes externas.
- Testar o site publicado em janela privada no Safari móvel.

### Por release

- Revisar cache de CSS/JS e versão realmente servida.
- Verificar Auth, subscriptions e limite de cinco.
- Testar backgrounds com reduced motion.
- Atualizar docs de comportamento/schema.

### Por atualização do Firebase SDK

O SDK é importado por URL versionada em `public/src/firebase.js`. Ao atualizar:

- leia notas de migração;
- valide Auth popup, persistence e `onSnapshot`;
- teste Safari/iOS;
- confirme que os módulos continuam disponíveis no CDN;
- publique primeiro em preview.

## Dívida técnica priorizada

### Alta

1. Atualizar a coleção e seu fallback antes do fim de 2026; a CI falhará quando não
   houver data futura no seed.
2. Criar ambiente Firebase de staging separado para testes integrados.
3. Validar OAuth, canvas e cache em Safari/iPhone real por release; a CI simula o
   viewport móvel em Chromium, não o motor WebKit do aparelho.

### Média

1. Extrair o restante do JavaScript inline de `index.html` para módulos.
2. Implementar/testar fallback de login por redirect para mobile.
3. Adicionar formatter/lint e screenshots de regressão.
4. Criar página 404 coerente ou remover rewrite global se houver rotas reais.
5. Migrar assets para nomes com hash e cache `immutable`.
6. Integrar error tracking sem conteúdo pessoal e alertas de orçamento/uso.

### Baixa

1. Medir desempenho dos fundos em aparelhos de entrada.
2. Revisar feedback de leitores de tela atualizado a cada segundo.
3. Reavaliar advisories transitivos da Firebase CLI em cada atualização.

## Adicionando um background

1. Adicione a opção ao select em `index.html`.
2. Registre a descrição em `BACKGROUND_DESCRIPTIONS`.
3. Defina o visual em CSS ou runtime em `firebase.js`.
4. Garanta que desligar/trocar pausa loops e limpa recursos.
5. Respeite velocidade, intensidade, cores e reduced motion.
6. Teste cards translúcidos, mobile, CPU e troca em tempo real.
7. Atualize `docs/design.md` e `docs/testing.md`.

## Alterando o limite de contadores

Atualize de forma atômica:

- `MAX_COUNTERS` no JavaScript;
- cópia e contador no HTML;
- regras do documento legado e `counters.items`;
- comportamento responsivo para a nova quantidade;
- documentação e testes.

Faça rules e Hosting compatíveis durante toda a janela de deploy.

## Observabilidade atual

Erros operacionais são enviados a `console.error` e exibidos via toast/estado na
UI. Não há error tracking centralizado. Google Analytics está configurado, mas não
substitui monitoramento de exceções, Auth ou Firestore.

Uma evolução útil é instrumentar eventos sem conteúdo pessoal: falha/sucesso de
login, tipo de erro, falha de subscription e estilo de background — nunca nome de
contador, email ou horários privados.
