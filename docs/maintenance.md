# Manutenção

## Rotina anual obrigatória

`public/src/data.js` contém datas de pagamentos e feriados de 2026. Antes da virada
do ano:

1. confirme a política de pagamento e os feriados desejados;
2. substitua/estenda os arrays com datas do próximo ano;
3. mantenha os arrays estritamente em ordem crescente;
4. use horários locais explícitos para evitar mudança involuntária de data;
5. teste dezembro do ano atual e janeiro do próximo com relógio simulado;
6. publique antes da última data cadastrada.

Quando todas as datas já passaram, `findNext` devolve a última data do array e o
contador fica em zero. Isso deve ser tratado como sinal operacional de calendário
vencido.

## Revisão periódica

### Mensal

- Consultar uso/custos de Firestore, Hosting e Auth.
- Conferir erros de login e permissions no console.
- Validar widget de clima e fontes externas.
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

1. Atualizar calendários antes do fim de 2026; a CI falhará quando não houver data
   futura.
2. Criar ambiente Firebase de staging separado para testes integrados.
3. Adicionar smoke tests de navegador, especialmente Auth em Safari/iOS.

### Média

1. Extrair o restante do JavaScript inline de `index.html` para módulos.
2. Implementar/testar fallback de login por redirect para mobile.
3. Adicionar formatter/lint e screenshots de regressão.
4. Criar página 404 coerente ou remover rewrite global se houver rotas reais.
5. Migrar assets para nomes com hash e cache `immutable`.

### Baixa

1. Definir ambientes staging/production.
2. Medir desempenho dos fundos em aparelhos de entrada.
3. Revisar feedback de leitores de tela atualizado a cada segundo.
4. Documentar política de privacidade e consentimento de analytics.
5. Reavaliar advisories transitivos da Firebase CLI em cada atualização.

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
