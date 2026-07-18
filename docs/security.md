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
- strings de perfil têm limites e `customCounters` legado aceita no máximo cinco.

Para `/users/{userId}/data/{documentId}`:

- apenas `settings`, `counters` e `images` são permitidos;
- cada documento usa um `match` literal próprio para não somar os três schemas no
  limite de expressões das Rules;
- somente o dono Google pode ler/escrever/excluir;
- settings validam allowlist, tipos, cores, estilos e ranges;
- counters validam allowlist, limite cinco e schemas fixo/recorrente;
- nomes, IDs, cores, horários e dias recebem validação de formato/range.

Para `/users/{userId}/counter-images/{slot}` no Cloud Storage:

- somente o dono autenticado com Google pode ler, enviar ou excluir;
- apenas slots `0` a `9` são aceitos;
- cada objeto aceita tipos de imagem conhecidos e no máximo 5 MiB;
- dez slots tornam impossível exceder 50 MiB por usuário pelas APIs do Storage.

Não existem leituras públicas ou queries de coleção autorizadas.

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
- Adobe Typekit e Firebase CDN recebem requests de assets.
- Firebase armazena email, nome, URL da foto e imagens enviadas pelo usuário.

`public/privacy.html` documenta essas finalidades. Os cookies de expediente são
funcionais; Analytics é opcional e separado. A conta, os três documentos operacionais e as imagens
podem ser apagados pelo usuário após reautenticação Google no menu da conta.

## Resposta a incidente

1. Restrinja rules antes de corrigir somente a UI quando houver exposição.
2. Revogue credenciais administrativas comprometidas no Google Cloud/Firebase.
3. Consulte logs/uso e determine UIDs/documentos afetados.
4. Preserve evidências antes de apagar dados.
5. Publique correção, teste isolamento e comunique usuários quando necessário.
