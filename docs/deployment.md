# Deploy e operação

## Ambientes atuais

O repositório aponta por padrão para o projeto Firebase `timekeeper-d9a0a`.
A CI valida todo push/PR, mas não publica. Não há ambiente versionado de staging e
todo deploy continua manual.

## O que é publicado

- Firebase Hosting: conteúdo de `public/`.
- Firestore Rules: `firestore.rules`.
- Firestore Indexes: `firestore.indexes.json`, hoje vazio.

O Hosting reescreve todas as rotas para `/index.html`.

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
npm run check
npm run test:e2e
npm run test:rules
git diff --check
```

3. Faça o checklist crítico:

- modo visitante e cookies;
- login/logout Google;
- leitura e escrita de settings;
- criar, editar, ordenar e excluir contadores;
- limite de cinco no cliente e nas rules;
- atualização em duas abas;
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

Mudança que também altera autorização ou contrato de contadores:

```bash
firebase deploy --only hosting,firestore:rules
```

Mudança de índices:

```bash
firebase deploy --only firestore:indexes
```

Publicar Hosting não atualiza rules automaticamente. Quando UI e rules precisam de
um novo contrato, coordene a ordem para nenhuma versão ficar temporariamente
incompatível; mudanças retrocompatíveis nas rules podem ser publicadas primeiro.

## Verificação pós-deploy

1. Abra a URL oficial em janela privada.
2. Verifique no DevTools se `firebase.js` e `style.css` são a versão esperada.
3. Faça login e confirme `0 / 5` ou a quantidade real.
4. Modifique uma preferência e confira outra aba/dispositivo.
5. Teste ao menos um fundo CSS e a constelação canvas.
6. Monitore console, Firestore Usage e Authentication no Firebase Console.

## Cache

Os assets ainda usam nomes estáveis, mas `firebase.json` configura `Cache-Control:
no-cache, max-age=0, must-revalidate` globalmente. Isso força revalidação e evita
que Safari/iOS combine versões antigas e novas após o deploy.

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

Antes da virada do ano, atualize `public/src/data.js`, valide ordem cronológica e
publique antes que as listas atuais expirem. Veja [Manutenção](maintenance.md).
