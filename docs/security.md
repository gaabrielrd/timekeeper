# Segurança

## Modelo de confiança

Todo código no navegador e todos os campos enviados pelo cliente são não confiáveis.
O usuário pode alterar JavaScript, requests e payloads. A fronteira de autorização
é formada por `firestore.rules`, `storage.rules` e Firebase Authentication.

## Autenticação

- Provedor permitido no produto: Google.
- O cliente usa `GoogleAuthProvider` com seleção explícita de conta.
- As rules verificam `request.auth.token.firebase.sign_in_provider == 'google.com'`.
- O UID autenticado precisa ser igual ao `{userId}` do path.

Isso impede login por outros provedores de acessar os dados, mesmo que sejam
habilitados acidentalmente no projeto.

## Autorização atual

Para `/users/{userId}`:

- dono Google pode ler e excluir;
- pode criar/atualizar somente campos de perfil/legado conhecidos;
- `isAdmin` é aceito no schema, mas não pode ser criado, alterado ou removido pelo
  próprio cliente;
- strings de perfil têm limites e `customCounters` legado aceita no máximo cinco.

Para `/generalConfig/{configId}`:

- qualquer visitante pode ler documentos e listar a coleção;
- criação, edição e remoção exigem Google OAuth e `isAdmin: true` no perfil;
- o documento `workday` não pode ser removido;
- IDs, tipos, horários, dias e `dateTime` seguem allowlists/formatos conhecidos;
- a consulta do perfil administrativo acontece nas Rules, nunca por confiança na UI.

Para `/users/{userId}/data/{documentId}` e `/users/{userId}/counters/{slot}`:

- apenas `settings`, `counters`, `archive` e `images` são permitidos;
- cada documento usa um `match` literal próprio para não somar os três schemas no
  limite de expressões das Rules;
- somente o dono Google pode ler/escrever/excluir;
- settings validam allowlist, tipos, cores, estilos, layouts, widgets de clima e
  preferências aninhadas de notificação;
- o documento agregado legado de counters é somente leitura/exclusão para permitir
  migração; novas escritas usam um documento por contador;
- cada contador valida allowlist e schema fixo/recorrente isoladamente;
- slots `0`–`4` impõem o limite Free e `0`–`14` o Premium sem contagem agregada;
- archive nasce vazio, aceita até 100 itens e só permite inserir um contador fixo
  válido no início ou remover exatamente um item existente;
- o tipo do contador seleciona o schema antes da validação e os dias usam uma
  allowlist de `0` a `6`, reduzindo o orçamento de expressões sem relaxar dados;
- nomes, IDs, cores, horários e dias recebem validação de formato/range.

Para `/teams/{teamId}`:

- somente membros presentes no mapa da equipe podem ler o documento e seus dados;
- `counters/{slot}` e `data/settings` aceitam escrita apenas de `admin` e `editor`;
- `viewer` pode acompanhar contadores, grupos e visibilidade em tempo real, sem
  permissão de criar, atualizar ou excluir esses documentos;
- `data/settings` possui allowlist restrita a `counterGroups`,
  `hiddenCounterGroups` e `updatedAt`;
- o limite dos contadores usa o plano do proprietário da equipe, não o plano do
  membro que realiza a edição;
- convites autenticados permitem apenas `get` pelo UUID exato; consultas à coleção
  são negadas, e somente administradores podem criar ou revogar links;
- a entrada na equipe passa pela callable Function `acceptTeamInvite`, que valida
  Google OAuth, expiração e limite de membros antes da atualização transacional.
- `getTeamMemberProfiles` só retorna nome, email e foto dos membros para um usuário
  que já pertença à equipe, sem conceder leitura cliente a `/users/{uid}` de outra
  pessoa;
- `deleteTeam` exige Google OAuth e valida dono ou papel `admin` no documento atual
  antes de remover recursivamente a equipe e suas subcoleções com Admin SDK.

Para links públicos de contadores:

- as Firestore Rules continuam negando leitura anônima direta de
  `/users/{uid}/counters/*` e `/teams/{teamId}/counters/*`;
- a callable `getPublicCounterData` é a fronteira pública: valida segmentos de path,
  consulta o ID lógico na subcoleção atual e só retorna o documento quando
  `isPublic == true`;
- settings são reduzidos a uma allowlist de campos visuais; perfis, membros,
  biblioteca, arquivo e outros contadores não são devolvidos.

Para `/users/{userId}/counter-images/{slot}` no Cloud Storage:

- somente o dono autenticado com Google pode ler, enviar ou excluir;
- apenas slots `0` a `9` são aceitos;
- cada objeto aceita tipos de imagem conhecidos e no máximo 5 MiB;
- dez slots tornam impossível exceder 50 MiB por usuário pelas APIs do Storage.

`generalConfig` é a única leitura pública e query de coleção autorizada diretamente
pelas Rules. A callable de publicação expõe somente um contador opt-in. Perfis,
settings completos e imagens continuam privados por UID; dados de equipe são
compartilhados somente entre os membros do respectivo `teamId`.

## Lacunas conhecidas

As rules ainda não implementam:

- garantir que `daysOfWeek` não contenha duplicatas;
- tornar `createdAt` imutável durante edição;
- limitar tamanho total do documento além dos campos individuais;
- comprovar que URLs de foto pertencem ao provedor esperado.

Esses pontos são risco de integridade dentro da própria conta, não vazamento entre
usuários. O cliente valida ordem de datas e normaliza dias antes da escrita.

## Recomendações priorizadas

1. Avaliar Firebase App Check para reduzir abuso automatizado.
2. Tornar `createdAt` imutável quando a compatibilidade legada permitir.
3. Criar alertas de orçamento/uso no projeto Firebase.
4. Validar periodicamente Auth e exclusão de conta em Safari/iPhone real.

As Rules de Firestore e Storage são testadas nos emuladores e rodam na CI. Os fluxos
Google OAuth emulado, CRUD, upload, persistência e exclusão de conta também rodam em
E2E Chromium desktop/mobile.

## Dependências de desenvolvimento

`npm audit --omit=dev` retorna zero vulnerabilidades. A `firebase-tools@15.24.0`
mais recente traz atualmente advisories moderados em dependências transitivas de
telemetria/CLI. Elas não são enviadas para `public/` nem executadas no navegador.
Não foi aplicado downgrade/override incompatível; reavalie a cada atualização.

## Configuração Firebase no frontend

O `apiKey` do SDK Web não é uma senha e precisa estar disponível no navegador.
Não tente “protegê-lo” movendo-o para outro arquivo público. Proteja o projeto com:

- rules corretas;
- domínios OAuth autorizados;
- APIs/restrições adequadas no Google Cloud quando aplicáveis;
- App Check e monitoramento;
- nenhuma credencial administrativa no cliente.

Nunca commite service account JSON, refresh tokens, cookies de sessão ou secrets de
CI. `.env` está ignorado, mas este projeto não o carrega automaticamente.

## XSS e conteúdo do usuário

Nomes de contadores são renderizados com `textContent`, não com `innerHTML`. Continue
usando criação DOM segura. O uso atual de `innerHTML` é reservado a strings geradas
internamente para intervalos e ícones conhecidos.

Se futuramente houver HTML rico, sanitize no cliente e valide no servidor; rules não
fazem sanitização.

## Privacidade e terceiros

- Google Analytics só é carregado depois de consentimento explícito persistido no
  navegador; contadores e horários pessoais não são enviados pelo código do app.
- WeatherWidget.io recebe requests do navegador e localização selecionada no link.
- Open-Meteo recebe as coordenadas públicas codificadas nesse link para retornar
  somente código da condição atual e estado de dia/noite.
- Adobe Typekit e Firebase CDN recebem requests de assets.
- Firebase armazena email, nome, URL da foto e imagens enviadas pelo usuário.
- Quando push é ativado, Firebase armazena FID, fuso, plataforma mínima, estado do
  dispositivo e fila técnica; App Check avalia a legitimidade da aplicação.

`public/privacy.html` documenta essas finalidades. Os cookies de expediente são
funcionais; Analytics é opcional e separado. A conta, os quatro documentos operacionais e as imagens
podem ser apagados pelo usuário após reautenticação Google no menu da conta.

O service worker da PWA intercepta somente requisições GET da própria origem. Ele
não armazena respostas de Firebase, Cloud Storage, WeatherWidget, Open-Meteo, Analytics ou
fontes externas. O cache contém apenas o shell público da aplicação e é versionado
para permitir limpeza de versões anteriores.

O fallback local mantém IDs expirantes no `localStorage` por UID. Para push, FIDs,
dispositivos, fila e métricas são inacessíveis pelo cliente e só passam pelo Admin
SDK. As callables privadas exigem Google Auth e App Check; a exceção pública é
`getPublicCounterData`, limitada ao contador opt-in. O registro push limita cinco
dispositivos e reduz refreshes repetidos. Jobs usam hash determinístico, não armazenam
título/corpo e expiram por TTL. Logout revoga o dispositivo; exclusão de conta remove
dispositivos e jobs antes de apagar o usuário. Logs registram somente totais
operacionais.

## Resposta a incidente

1. Restrinja rules antes de corrigir somente a UI quando houver exposição.
2. Revogue credenciais administrativas comprometidas no Google Cloud/Firebase.
3. Consulte logs/uso e determine UIDs/documentos afetados.
4. Preserve evidências antes de apagar dados.
5. Publique correção, teste isolamento e comunique usuários quando necessário.
