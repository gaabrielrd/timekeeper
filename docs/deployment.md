# Deploy e operação

## Ambientes atuais

O repositório aponta por padrão para o projeto Firebase `timekeeper-d9a0a`.
A CI valida todo push/PR, mas não publica. Não há ambiente versionado de staging e
todo deploy continua manual.

## O que é publicado

- Firebase Hosting: conteúdo de `public/`.
- Cloud Functions 2ª geração: callables de dispositivos e scheduler FCM em
  `southamerica-east1`.
- Firestore Rules: `firestore.rules`.
- Storage Rules: `storage.rules`.
- Firestore Indexes/TTL: `firestore.indexes.json`.

O Hosting reescreve todas as rotas para `/index.html`.

## Provisionamento do Storage

O cliente aponta para o bucket existente `timekeeper-d9a0a.appspot.com` do
projeto `timekeeper-d9a0a`. Ao provisioná-lo pela primeira vez, selecione `us-east1`;
a localização do bucket não pode ser alterada depois. O código não cria nem move o
bucket: provisionamento e deploy de rules continuam ações remotas explícitas.

## Pré-deploy

1. Confirme branch, worktree e projeto:

```bash
git branch --show-current
git status --short
firebase use
```

2. Execute checagens:

```bash
npm ci
npm ci --prefix functions
npm run check
npm run test:e2e
npm run test:rules
git diff --check
```

3. Faça o checklist crítico:

- modo visitante e cookies;
- login/logout Google;
- leitura e escrita de settings;
- leitura pública de `generalConfig` e escrita com perfil administrativo;
- criar, editar, ordenar e excluir contadores;
- limite de cinco no cliente e nas rules;
- upload, reutilização, quota e exclusão de imagens;
- atualização em duas abas;
- layouts, cidades, Timeline e notificações locais;
- push em foreground/background, logout e revogação de dispositivo;
- PWA instalada, shell offline e atualização do service worker;
- desktop e Safari móvel;
- fundos desligado, CSS e canvas;
- reduced motion.

## Preview

Para mudanças somente de Hosting, um preview channel reduz risco:

```bash
firebase hosting:channel:deploy preview
```

O preview ainda usa os serviços Firebase configurados no cliente. Não insira dados
sensíveis nem assuma isolamento de produção.

## Publicação

Mudança apenas em conteúdo estático:

```bash
firebase deploy --only hosting
```

Mudança que também altera autorização, contadores ou biblioteca de imagens:

```bash
firebase deploy --only hosting,firestore:rules,storage
```

Mudança no fluxo de links públicos:

```bash
firebase deploy --only firestore:rules,functions,hosting
```

Os três alvos são coordenados: Rules aceitam `isPublic`, a Function lê a subcoleção
atual e o Hosting entrega assets corretos nas rotas `/p/...`.

Mudança de índices:

```bash
firebase deploy --only firestore:indexes
```

Publicação da Fase 5B, depois de configurar VAPID e App Check:

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

Esse comando cria/atualiza um job do Cloud Scheduler. O primeiro deploy pode pedir
ativação de Cloud Functions, Cloud Build, Artifact Registry, Eventarc e Cloud
Scheduler. Revise as APIs solicitadas e confirme que o projeto ativo é
`timekeeper-d9a0a` antes de aceitar.

Publicar Hosting não atualiza rules automaticamente. Quando UI e rules precisam de
um novo contrato, coordene a ordem para nenhuma versão ficar temporariamente
incompatível; mudanças retrocompatíveis nas rules podem ser publicadas primeiro.

## Inicialização administrativa

A primeira concessão de administrador não pode ser feita pela aplicação. No
Firebase Console ou por Admin SDK autenticado, defina `isAdmin: true` no documento
`users/{uid}` do operador. Não adicione essa flag a settings nem a custom claims sem
alterar também o contrato das Rules.

Depois do deploy das Rules, o próximo login desse operador:

1. exibe “Configuração geral” no menu da conta;
2. detecta `generalConfig` completamente vazia;
3. grava em batch o expediente e as 22 datas presentes no seed de `data.js`.

Confirme no Console a presença de `generalConfig/workday`, 12 documentos
`payment-*` e 10 documentos `holiday-*`. Se a coleção já tiver qualquer documento,
o seed automático não sobrescreve nem recria dados.

## Ativação de push

1. Confirme o plano Blaze e crie alertas de orçamento no Google Cloud Billing.
2. Em Firebase Console > Configurações do projeto > Cloud Messaging > Certificados
   Web Push, gere ou importe um par e copie somente a chave pública VAPID.
3. Em App Check, registre a aplicação Web com reCAPTCHA Enterprise. Adicione os
   domínios de produção/preview e copie a site key pública.
4. Preencha `vapidKey` e `recaptchaEnterpriseSiteKey` em
   `public/src/runtime-config.js`. Nunca versione a chave VAPID privada, service
   account ou segredo reCAPTCHA.
5. Confirme que a Cloud Messaging API está habilitada.
6. Execute o deploy conjunto acima. As callables usam enforcement de App Check
   desde a primeira publicação, portanto não publique o Hosting configurado antes
   de o provider estar operacional.
7. Em Firestore > TTL, confirme as políticas `purgeAt` para `devices`,
   `notificationQueue` e `pushMetrics` após a criação assíncrona.

As chaves de `runtime-config.js` são públicas por definição. Auth, App Check,
Firestore Rules e o Admin SDK formam a barreira de autorização.

## Verificação pós-deploy

1. Abra a URL oficial em janela privada.
2. Verifique no DevTools se `firebase.js` e `style.css` são a versão esperada.
3. Faça login e confirme `0 / 5` ou a quantidade real.
4. Modifique uma preferência e confira outra aba/dispositivo.
5. Com um admin, abra as três abas e altere uma data temporária.
6. Em janela privada, confirme que os contadores públicos recebem a atualização.
7. Envie uma imagem, reutilize-a em dois cards e confirme a quota.
8. Teste ao menos um fundo CSS, a constelação Canvas 2D e os cinco modos WebGL.
9. Monitore console, Firestore/Storage Usage e Authentication no Firebase Console.
10. Ative notificações em um dispositivo de teste e aguarde `Push ativo`.
11. Crie um evento próximo e valide uma entrega com a aba visível, outra em
    background e outra com o PWA/navegador fechado quando a plataforma suportar.
12. Faça logout e confirme em `users/{uid}/devices` que o documento foi revogado;
    valide também que negar permissão não cria novo prompt após reload.
13. Confira logs de `dispatchPushNotifications`, `notificationQueue`, métricas e
    ausência de nomes/textos de eventos em logs operacionais.

## Cache

Os assets ainda usam nomes estáveis, mas `firebase.json` configura `Cache-Control:
no-cache, max-age=0, must-revalidate` globalmente. Isso força revalidação e evita
que Safari/iOS combine versões antigas e novas após o deploy.

`/sw.js` e `/manifest.webmanifest` possuem headers específicos sem cache prolongado.
Após publicar uma nova versão, confirme que o banner de atualização aparece para
uma aba controlada pela versão anterior e que “Atualizar agora” troca o service
worker antes de recarregar. O cache do shell nunca deve incluir dados privados ou
respostas externas.

Solução de longo prazo: pipeline que gere assets com hash e cache `immutable`,
mantendo o HTML revalidável.

Depois de deploys visuais, teste uma janela privada. Recarregar uma aba normal no
Safari nem sempre invalida todos os recursos.

## Rollback

O Firebase Hosting preserva releases anteriores e permite reverter pelo Console.
Se houver problema:

1. interrompa novos deploys;
2. identifique se a falha está no Hosting, rules ou dados;
3. reverta a release do Hosting pelo Firebase Console quando aplicável;
4. para rules, publique explicitamente a versão anterior revisada;
5. valide dados criados sob o contrato novo antes de restaurar código antigo.

Não use rollback de Hosting como rollback de schema: documentos do Firestore não
são revertidos junto com os arquivos estáticos.

## Domínios e OAuth

Todo domínio de produção/preview usado para login deve estar autorizado em Firebase
Authentication. Um domínio ausente causa `auth/unauthorized-domain`. Popups também
podem ser bloqueados por Safari, WebViews e políticas de privacidade.

## Checklist de release anual

Antes da virada do ano, atualize pagamentos e feriados pelo modal administrativo.
Mantenha `public/src/data.js` atualizado como fallback para novas instalações e
valide ordem cronológica antes da publicação. Veja [Manutenção](maintenance.md).
