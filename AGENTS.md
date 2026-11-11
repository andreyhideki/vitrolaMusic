# AGENTS.md — Vitrola Music

> **Regra de manutenção:** ao implementar qualquer feature, correção ou refatoração, atualize este arquivo. As seções **Estado atual / Features implementadas**, **Em andamento** e **Regras** devem refletir o código real do repositório após a mudança.

## Ambiente de desenvolvimento

- **Docker é o fluxo padrão.** Use `make up` para subir API + frontend. Não execute `npm run dev` diretamente no host a menos que esteja seguindo o fluxo "Sem Docker" do README.
- `make typecheck` verifica tipos de **API e frontend** (roda nos dois containers).
- `make test` roda **somente** os testes do frontend (`frontend/src/player/queue.test.ts` via vitest).
- `make reset` recria os volumes de `node_modules`. Use depois de alterar dependências.
- `make clean` remove containers, volumes e imagens, **mas não apaga `./data`**.
- Os containers usam `node:24-bookworm` e rodam como usuário `node` (uid 1000). `make up` executa antes `make fix-perms`, que ajusta o dono de `./data`, `frontend/dev-dist` e `frontend/dist`.

## Arquitetura

- Monorepo simples:
  - `api/` — Express 5 + TypeScript (`tsx watch`), SQLite via `better-sqlite3`.
  - `frontend/` — React 18 + Vite + TypeScript + Zustand.
- O Vite no container faz proxy de `/api` para o serviço `api` do Compose (`API_TARGET`). Localmente (fora do Docker) o padrão é `http://localhost:5172`.
- A API escuta em `0.0.0.0:5172` no container; o frontend em `0.0.0.0:5173`. No host, a API é publicada **só em `127.0.0.1`**; o frontend em `${VITROLA_BIND:-127.0.0.1}`. Outros aparelhos acessam a API pelo proxy `/api` do frontend.
- Configuração do compose via `.env` na raiz (modelo em `.env.example`): `VITROLA_BIND` (use `0.0.0.0` para acesso pela rede/celular), `AUTH_TOKEN`, `AUTH_DISABLED` e `ALLOWED_HOSTS`.

## Dados e persistência

- Banco SQLite: `./data/vitrola.db`. Modo WAL ativado em `api/src/db.ts`.
- Mídia baixada: `./data/media` por padrão. Pode ser sobrescrito pela configuração `mediaDir` (tabela `settings`), que é **relativa a `DATA_DIR` e precisa ficar dentro dela**; valores fora disso são rejeitados (400) ou ignorados se já estiverem salvos.
- Pasta de importação: `./data/import`. Arquivos locais nomeados como `Artista - Título.mp3` são detectados pelo `localFolderProvider`.
- Migrations são manuais e idempotentes: verificações de coluna em `api/src/db.ts` + `CREATE TABLE IF NOT EXISTS`. As verificações de coluna (`hasColumn` + `ALTER TABLE`) ficam **depois** do bloco `CREATE TABLE`; antes dele, um banco novo falha com `no such table`.
- **Atenção:** ao iniciar, `resumeDownloads()` enfileira **todas** as faixas com `download_status = 'pending'`.

## Downloads e fontes de áudio

- O downloader (`api/src/services/downloader.ts`) tenta primeiro arquivo local em `IMPORT_DIR`, depois busca a faixa em uma fonte externa via `externalProvider` (`api/src/services/external.ts`).
- O container da API já inclui `ffmpeg`, `python3` e o `yt-dlp` (versão fixada em `api/Dockerfile`). Não é necessário instalar no host quando usa Docker.
- Metadados externos vêm de `api/src/services/catalogApi.ts`. Identificadores externos usam o prefixo `catalog:`; a migração em `api/src/db.ts` converte prefixos legados ao iniciar.
- A tabela `tracks` possui a coluna `last_played_at`. O endpoint `POST /api/tracks/:id/played` registra a reprodução; o player chama esse endpoint ao iniciar uma faixa.
- A tela inicial mostra o espaço usado pelas músicas baixadas via `GET /api/library/usage`.
- A configuração `cleanupUnusedAfterDays` (0 = desativado) define em quantos dias faixas baixadas e não tocadas são removidas automaticamente pelo scheduler (`api/src/services/cleanup.ts`); o valor de 180 dias está disponível na UI.
- Configuração de cookies do YouTube (`api/src/settings.ts`): o usuário cola o conteúdo do arquivo de cookies diretamente no modal de configurações; o backend salva em `./data/youtube-cookies.txt` (`COOKIES_FILE`, permissão 0600) e o `yt-dlp` recebe `--cookies <caminho>` em downloads e streams. O caminho é fixo: a API **não aceita** `youtubeCookiesPath` vindo do cliente, porque o `yt-dlp` regrava o arquivo de cookies. Inclui painel com passo a passo e alerta de risco de bloqueio/limitação da conta Google.
- O `externalProvider` (`api/src/services/external.ts`) usa `--extractor-args "youtube:player_client=android"` para contornar restrições SABR que bloqueiam o cliente web.
- Downloads e streams tentam primeiro **sem cookies** (conexão anônima); apenas se essa tentativa falhar e houver cookies configurados é que os cookies são usados. Isso evita que contas no experimento SABR-only do YouTube fiquem sem formatos de áudio disponíveis.
- Nome final dos arquivos: `Artista - Álbum - Título.mp3`.
- A coluna `tracks.loudness_lufs` guarda a loudness integrada (EBU R128) medida por `getLoudness()` (`api/src/services/audio-meta.ts`, filtro `loudnorm` do `ffmpeg`) logo após cada download. Ao iniciar, `analyzeMissingLoudness()` (`api/src/services/loudness.ts`) mede, uma por vez e em segundo plano, as faixas `ready` que ainda estão com `NULL`. O valor vai para o frontend como `TrackDto.loudnessLufs`.
- Mensagens de erro do `yt-dlp` são resumidas (última linha `ERROR:`, sem caminhos, até 300 caracteres) antes de ir para `tracks.error`; o stderr completo vai para o log da API.
- `GET /api/tracks/:id/stream-url` faz proxy do stream externo com backpressure, aborta o upstream quando o cliente desconecta e limita a 3 streams simultâneos (429 acima disso).
- Status de download (`pending` | `downloading` | `ready` | `failed`) fica na tabela `tracks`. O endpoint `GET /api/albums/:id` normaliza o status pela existência real do arquivo no disco: se o arquivo existe, é `ready`; se não existe, nunca é `ready`.

## Convenções de código

- API e frontend usam ESM (`"type": "module"`).
- Não há linter/formatter configurado. Siga o estilo existente.
- A API usa `HttpError` (`api/src/http.ts`) para erros HTTP; o middleware central converte em JSON `{ error: ... }`.
- Autenticação (`api/src/auth.ts`): token único, de `AUTH_TOKEN` ou gerado na 1ª execução em `./data/auth-token.txt` (0600, formato `XXXXX-XXXXX-XXXXX-XXXXX`; `make token` mostra). `POST /api/auth/login` troca o token por um cookie `vitrola_session` (HttpOnly, SameSite=Strict, Path=/api, 1 ano) que é um HMAC do token; trocar o token invalida as sessões. Também aceita `Authorization: Bearer <token>`. Todas as rotas exigem auth, exceto `/api/health` e `/api/auth/*`. Login limitado a 10 falhas/minuto (global, porque atrás do proxy do Vite todas as requisições têm o mesmo IP). Ao adicionar rotas públicas, inclua em `PUBLIC_PATHS`. `AUTH_DISABLED=true` (no `.env` da raiz) desliga a autenticação para testes: a API loga um aviso, `/api/auth/status` responde `{ authenticated: true, disabled: true }` e o frontend pula o login e esconde o botão "Sair". Nunca combine com `VITROLA_BIND=0.0.0.0`.
- No frontend, `frontend/src/auth.ts` (Zustand) controla o status; `App` mostra `LoginView` quando não autenticado, e o helper `api()` chama `expired()` em respostas 401. Um link `http://host:5173/#token=...` faz login automático e remove o token da URL. O botão "Sair deste aparelho" fica nas Configurações.
- Segurança (`api/src/index.ts`): headers básicos (`nosniff`, `X-Frame-Options`, CSP, CORP), checagem do header `Host` (DNS rebinding): aceita IPs literais, `localhost`, `api` e nomes extras de `ALLOWED_HOSTS` (que também alimenta `server.allowedHosts` do Vite), e exigência de `Content-Type: application/json` em métodos que alteram estado (CSRF). O helper `api()` do frontend já envia esse header em todas as requisições: requisições novas devem passar por ele.
- No frontend, estado global fica em Zustand (`frontend/src/library.ts`, `frontend/src/player/usePlayerAudio.ts`, `frontend/src/nav.ts`).

## Testes

- `make test` roda `vitest run` no container `web`.
- Para rodar um teste específico dentro do container: `docker compose run --rm --no-deps web npx vitest run src/player/queue.test.ts`.
- Não há testes de API. Valide alterações na API com `make typecheck` e testes manuais.

## Hot reload e bind mounts

- Código é montado por volume (`./api:/app`, `./frontend:/app`), então alterações refletem automaticamente.
- `node_modules` fica em volumes nomeados (`api_node_modules`, `web_node_modules`) para não conflitar com o host.
- Se hot reload falhar no macOS/Windows, `CHOKIDAR_USEPOLLING=true` já está configurado no `docker-compose.yml`.

## Gotchas operacionais

- A API roda `resumeDownloads()` ao iniciar. Reiniciar o container pode reiniciar downloads pendentes.
- Alterar o schema do SQLite exige cuidado: use `CREATE TABLE IF NOT EXISTS` e verificações de coluna como as existentes em `api/src/db.ts`.
- O `file_path` na tabela `tracks` é salvo como caminho **absoluto** (registros antigos podem ser relativos a `getEffectiveMediaDir()`). Sempre converta com `resolveTrackFile()` (`api/src/settings.ts`) antes de ler ou apagar: ele aceita os dois formatos e devolve `null` para caminhos fora de `DATA_DIR` ou que não sejam áudio. Verifique a existência do arquivo antes de confiar em `download_status = 'ready'`.
- O player consulta `useLibrary` para saber se uma faixa está pronta (`isReady`). Sempre que uma faixa terminar de baixar, atualize o cache da biblioteca com `useLibrary.getState().upsert([track])`.
- Telas com polling de download (`AlbumView`, `AlbumPreviewView`) devem rastrear quais faixas já estão sendo observadas para evitar requisições em loop.
- **Cookies do YouTube e SABR:** contas no experimento SABR-only do YouTube podem receber apenas storyboards (imagens) quando os cookies são enviados, resultando em `Requested format is not available`. O downloader contorna isso tentando primeiro sem cookies; só recorre aos cookies se a tentativa anônima falhar.

## Estado atual / Features implementadas

- Busca unificada (biblioteca local + catálogo externo), com resultados ordenados em Álbuns, Playlists (locais) e Músicas; campo de busca sticky, botão de limpar e artistas clicáveis.
- Menu "Paranoic" (frontend/src/views/AnalyticsView.tsx) com estatísticas de reprodução: totalizadores, ranking por música/artista/álbum/gênero e gráficos por dia/semana/mês/ano; gráficos de barras com valor acima de cada barra, rótulos de período formatados em pt-BR abaixo do eixo (sem sobreposição) e rolagem horizontal quando há muitos períodos.
- Página inicial (`frontend/src/views/LibraryView.tsx`, menu "Início") em estilo dashboard: saudação, contagem de álbuns/faixas/playlists, espaço usado em disco e ações "Tocar tudo" / "Aleatório".
- A página Início recarrega a biblioteca automaticamente a cada 5 segundos e ao retornar à aba (`visibilitychange`), refletindo álbns/faixas recém-baixados sem refresh manual.
- Filtro de visualização na página Início: botão "Álbuns baixados" exibe uma grid completa dos álbuns disponíveis localmente, com capa, artista, contagem de faixas e play por álbum.
- Carrossel de álbuns na home (`frontend/src/components/AlbumCarousel.tsx`): arrastável, com setas < > ao lado do título que rolam de 1 a 3 álbuns por clique.
- Capas de álbum na página inicial têm botão de play em destaque (borda verde) que toca o álbum; vira pause (borda vermelha) quando o álbum está sendo reproduzido.
- Importação de faixas e álbuns do catálogo externo, com enfileiramento automático de downloads.
- Player com fila, shuffle, repeat, "tocar a seguir", "adicionar à fila", Media Session, pré-carregamento da próxima faixa e persistência de volume entre faixas.
- Crossfade configurável (`crossfadeSeconds`, 0–12 s, slider nas Configurações): o player usa **dois** `<audio>` (`getAudio()` é o ativo, `getOutgoing()` o que está saindo). No `timeupdate`, quando faltam N segundos, `maybeStartCrossfade()` troca o ativo, inicia a próxima faixa com fade-in e faz fade-out da anterior (curva de potência constante). Não acontece com repeat "one", fim da fila, próxima faixa não pronta ou faixas com menos de 2N+1 s. Pular/pausar durante o fade corta a faixa que estava saindo.
- Equalização de volume (`normalizeVolume`): o volume de cada `<audio>` é `volume geral × ganho de normalização × fade` (`applyVolume()`). O ganho leva a faixa ao alvo de -16 LUFS, só atenuando (o `volume` do elemento não passa de 1), limitado a -15 dB; faixas sem análise (ex.: streaming) assumem -11 LUFS. As configurações chegam ao player por `playerControls.configure()` (no `App` ao carregar e no `SettingsModal` ao salvar).
- Playlists: criar, editar, excluir, adicionar/remover faixas, reordenar arrastando pela alça ⋮⋮ (`@dnd-kit/sortable`; mouse, toque com 150 ms de espera e teclado; atualização otimista + `PATCH /playlists/:id/order`), buscar músicas na biblioteca para adicionar e sugestões por gênero (até 10 faixas).
- Tela de álbum (`frontend/src/views/AlbumView.tsx`) mostrando faixas baixadas e não baixadas, com botão "Importar" e barra de progresso do download.
- Pré-visualização de álbum (`frontend/src/views/AlbumPreviewView.tsx`) com importação individual, importação do álbum inteiro e barra de progresso do download.
- Clicar na faixa atual do player (`PlayerBar`) abre a origem do que está tocando: `playFrom`/`playPlaylist` recebem um `source: View` opcional, salvo em `usePlayerStore().source` (persistido). Sem origem, abre o álbum da faixa. Ao adicionar novos pontos de reprodução, passe o `source`.
- Controle de volume funcional (mute/unmute + slider).
- Histórico das últimas 10 buscas, persistido em `localStorage`.
- Endpoint `GET /api/tracks/:id/progress` retorna percentual e status do download, também verificando a existência real do arquivo no disco.
- Normalização de status no endpoint de álbum pela existência real do arquivo em disco.
- Toast/notificações globais (`frontend/src/notice.ts` + `frontend/src/components/NoticeContainer.tsx`) exibem alertas de erro quando todas as faixas (ou parte delas) de um álbum falham no download.
- Tela de álbum exibe indicador "Erro" nas faixas com `download_status = 'failed'`.
- Modal de confirmação customizado (`frontend/src/components/ConfirmModal.tsx`) para exclusão de álbuns, faixas e playlists, substituindo o `confirm` nativo do navegador.
- Layout responsivo (breakpoints em `frontend/src/useMediaQuery.ts` e no fim de `frontend/src/styles.css`: mobile ≤ 640px, tablet 641–1024px, desktop > 1024px). Desktop segue a preferência de menu recolhido; tablet força o menu recolhido (só ícones); mobile usa gaveta escondida aberta pelo botão ☰ do `Header` (fecha ao tocar fora, ao navegar, com Esc e com o "voltar" do aparelho). No mobile o player fica em duas linhas (sem volume/shuffle/repeat) e as ações das faixas da `TrackList` ficam no menu "⋯".
- PWA — Fase 1 (instalável): manifest, ícones PWA (`frontend/public/pwa-*.png`, `apple-touch-icon.png`), meta tags mobile, safe areas e Service Worker gerado pelo `vite-plugin-pwa` com prompt de atualização (`frontend/src/components/PwaReloadPrompt.tsx`).

### Em andamento / desenvolvimento

- (nenhum)

## Regras

- **Antes de implementar, procure por arquivos, hooks ou componentes com nome parecido** para não refazer o que já existe. Use `grep` ou `glob` para encontrar rotas, stores, hooks, views ou serviços relacionados.
- Sempre que alterar dependências, rode `make reset` para recriar os volumes de `node_modules`.
- Valide alterações de tipo com `make typecheck` antes de considerar a tarefa pronta.
- Não confie cegamente em `download_status = 'ready'`: verifique a existência do arquivo no disco quando o status afetar a UI.
- Mantenha este `AGENTS.md` atualizado conforme novas features, regras ou gotchas forem descobertos.
- Configuração do frontend via variáveis em `frontend/.env` (ignorado pelo git; modelo em `frontend/.env.example`, tipagem em `frontend/src/vite-env.d.ts`). O `vite.config.ts` expõe os prefixos `VITE_` e `URL_` (`envPrefix`). `URL_BUY_ME_A_COFFEE` define o link de apoio; se ausente, usa o padrão `https://buy.stripe.com/7sYcN7a5BdqVg1adWrcAo00` (em `frontend/src/config.ts`); se definida vazia, o botão some do menu e da home. Valores com esses prefixos vão para o bundle do navegador: nunca coloque segredos neles. Após alterar o `.env` ou o `vite.config.ts`, reinicie o container `web`.
- Ao acessar de outro aparelho (ex.: celular), defina `VITROLA_BIND=0.0.0.0` no `.env` da raiz e rode `make up`. Se usar um nome (ex.: `meupc.local`) em vez do IP, inclua-o em `ALLOWED_HOSTS`. **Android:** o navegador precisa da permissão "Dispositivos próximos" / "Rede local" (Informações do app → Permissões). Sem ela, o Chrome bloqueia qualquer IP local (até o roteador) com `ERR_TOO_MANY_RETRIES` e a conexão nem chega ao PC. Isso está documentado no README, em "Android: permissão de rede local". Com WSL2 + Docker Desktop, a porta publicada já escuta em `0.0.0.0` no Windows (`com.docker.backend`), sem `portproxy`. Em HTTP pela rede o navegador não registra o Service Worker (exige HTTPS ou localhost), então a instalação como PWA no celular fica limitada.
- Layout responsivo: a altura do player é a variável CSS `--player-h` (96px no desktop, 112px no mobile); use-a em `calc()` em vez de valores fixos. O tamanho de tela fica em `useUi().screen` (definido pelo `App`); use `useSidebarCollapsed()` para o estado efetivo do menu. O recolhimento automático por tamanho de tela **não** é gravado no `localStorage` (só a preferência do desktop). Mantenha os breakpoints de `useMediaQuery.ts` e `styles.css` iguais.
- Cookies do YouTube no modal: "Salvar" só envia `youtubeCookiesContent` quando o campo tem conteúdo (string vazia **remove** os cookies no backend); a remoção tem botão próprio "Remover cookies"; "Carregar arquivo .txt" lê o arquivo exportado (até 1 MB) para o campo.
- `npm audit` do frontend ainda aponta itens moderados/baixos em `workbox-build` (dependência de build do `vite-plugin-pwa`); não são exploráveis em runtime e a única correção sugerida é rebaixar o plugin.
- Player: nunca altere `el.volume` diretamente; use `applyVolume(el)` / `playerControls.setVolume()` para respeitar normalização e fades. Listeners de `<audio>` devem ignorar eventos do elemento que não é o ativo. No iOS o `volume` do `<audio>` é somente leitura: o crossfade vira apenas sobreposição e a normalização não tem efeito.
- O Service Worker do PWA está habilitado também em desenvolvimento (`devOptions.enabled: true`). Se comportamentos estranhos de cache atrapalharem o hot reload, desabilite temporariamente no `vite.config.ts` ou use uma aba anônima.
