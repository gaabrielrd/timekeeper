# Estratégia de testes

## Estado atual

O projeto usa Node Test Runner e Firebase Emulator Suite. A suíte atual contém 17
testes unitários/contratuais e 9 testes de Firestore Rules. GitHub Actions executa
todos em pushes, pull requests e disparos manuais.

## Checagens rápidas

```bash
npm ci
npm run check
npm run test:rules
git diff --check
```

`npm test` executa unit/contratos + rules em sequência. Java 21+ é obrigatório para
o emulador Firestore.

## Cobertura automatizada

### Lógica temporal

- decomposição e formatação de intervalos;
- seleção do próximo evento e calendário vencido;
- progresso antes, entre e depois de datas;
- contador fixo válido/inválido;
- recorrência ativa, próxima ocorrência, fim de semana e meia-noite;
- normalização de dias inválidos/duplicados.

### Contratos do repositório

- limite cinco alinhado entre HTML, JS e rules;
- catálogo e descrições dos sete backgrounds;
- ordem de carregamento dos scripts;
- compilação do JavaScript inline;
- headers de cache e portas dos emuladores;
- opt-in local dos emuladores e fallbacks Safari;
- calendários ordenados com ao menos uma data futura;
- links Markdown locais válidos.

### Firestore Rules

- não autenticado, acesso cruzado e provedor não Google negados;
- perfil/settings válidos aceitos;
- ranges e campos desconhecidos negados;
- schemas fixo/recorrente aceitos;
- cinco permitidos e seis negados;
- nomes, cores, horários e dias inválidos negados;
- documentos fora da allowlist negados;
- leitura do proprietário permitida.

Também confira o console do navegador sem filtros. Erros de bloqueadores em Google
Analytics podem ser separados de erros do produto, mas devem ser entendidos.

## Matriz mínima de navegadores

| Plataforma | Cobertura |
| --- | --- |
| Chrome/Edge desktop atual | Fluxo completo e DevTools |
| Firefox desktop atual | Layout, Auth e CSS |
| Safari macOS atual | OAuth, dialog, color-mix e fullscreen |
| Safari iPhone real | Cache, touch, sidebar, popup e canvas |
| Android Chrome | Touch, viewport e desempenho |

Viewports sugeridos: 320, 390, 768, 1024 e 1440 px.

## Checklist funcional

### Visitante

- Página abre sem autenticação.
- Três contadores padrão atualizam a cada segundo.
- Expediente alterna corretamente entre “Ainda faltam” e “Começa em”.
- Hora/minuto mudam imediatamente e persistem após reload.
- Login é apresentado somente como Google.
- Sidebar e contadores pessoais não aparecem.
- Tela cheia funciona onde a API é suportada.

### Autenticação

- Popup permite escolher uma conta Google.
- Cancelar popup mostra mensagem amigável.
- Primeiro login cria perfil, settings e counters.
- Login existente não sobrescreve preferências.
- Foto/nome/email aparecem corretamente.
- Logout cancela subscriptions e volta ao horário local dos cookies.

### Configurações ao vivo

- Alterar fim do expediente atualiza o contador e outra aba.
- Cores têm preview durante input e persistem ao concluir.
- Toggle de fundo inicia desligado para conta nova.
- Estilo, cores, velocidade e intensidade sincronizam em outra aba.
- Falha de escrita apresenta erro sem deixar estado enganoso.

### Contadores pessoais

- Criação fixa inicia em “agora” e termina 24 h depois por padrão.
- Datas inválidas e fim anterior são rejeitados.
- Recorrente exige ao menos um dia.
- Evento ativo conta até terminar; inativo conta até o próximo início.
- Evento 22:00–06:00 atravessa meia-noite.
- Cor própria muda a barra; sem cor herda o destaque.
- Edição preserva ID, ordem e data de criação.
- Setas respeitam primeiro/último item.
- Exclusão pede confirmação e atualiza outra aba.
- O sexto contador é impedido na UI e pelas rules.
- O botão do header só aparece com ao menos um contador.
- Ocultar/mostrar abre a seção com animação de acordeão.

## Checklist visual

- Header e cards mantêm contraste sobre todos os fundos.
- Um, três, quatro e cinco cards não cortam números ou títulos.
- Em desktop, quatro/cinco permanecem na mesma linha.
- Em mobile, todos viram uma coluna sem overflow X.
- Sidebar não cria rolagem horizontal.
- Modal cabe no viewport e campos recorrentes trocam sem salto abrupto.
- Weather widgets não piscam branco durante a entrada.
- Entrada da página e acordeão são suaves.
- Anéis cronológicos não dão pop a cada segundo.
- Topografia se move de forma orgânica.
- Constelação mostra estrelas, linhas e halo sem dominar o conteúdo.
- Reduced motion praticamente remove transições e mantém conteúdo acessível.

## Teste de sincronização

Abra duas abas com a mesma conta:

1. Mude uma cor na aba A e confirme na B.
2. Crie um contador na B e confirme na A.
3. Reordene na A enquanto a B está aberta.
4. Desconecte a rede, tente alterar e observe erro/rollback.
5. Reconecte e confirme que snapshots convergem.

Repita isolamento com duas contas: nenhuma deve ler documentos da outra.

## Próxima automação recomendada

Ordem sugerida:

1. Criar smoke tests Playwright para visitante e UI responsiva.
2. Cobrir login Google via Auth Emulator em teste de navegador.
3. Adicionar formatter/lint para HTML, CSS e JS.
4. Capturar screenshots de regressão para os sete backgrounds.
5. Medir desempenho da constelação em viewport móvel.
