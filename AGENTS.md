# AGENTS.md — Vitrola Music

> **Regra de manutenção:** ao implementar qualquer feature, correção ou refatoração, atualize este arquivo. As seções **Estado atual / Features implementadas**, **Em andamento** e **Regras** devem refletir o código real do repositório após a mudança.

## Ambiente de desenvolvimento

- **Docker é o fluxo padrão.** Use `make up` para subir API + frontend. Não execute `npm run dev` diretamente no host a menos que esteja seguindo o fluxo "Sem Docker" do README.
- `make typecheck` verifica tipos de **API e frontend** (roda nos dois containers).
- `make test` roda **somente** os testes do frontend (`frontend/src/player/queue.test.ts` via vitest).
- `make reset` recria os volumes de `node_modules`. Use depois de alterar dependências.
- `make clean` remove containers, volumes e imagens, **mas não apaga `./data`**.

## Arquitetura

- Monorepo simples:
  - `api/` — Express 5 + TypeScript (`tsx watch`), SQLite via `better-sqlite3`.
  - `frontend/` — React 18 + Vite + TypeScript + Zustand.
- O Vite no container faz proxy de `/api` para o serviço `api` do Compose (`API_TARGET`). Localmente (fora do Docker) o padrão é `http://localhost:5172`.
- A API escuta em `0.0.0.0:5172` no container; o frontend em `0.0.0.0:5173`.

## Dados e persistência

- Banco SQLite: `./data/vitrola.db`. Modo WAL ativado em `api/src/db.ts`.
- Mídia baixada: `./data/media` por padrão. Pode ser sobrescrito pela configuração `mediaDir` (tabela `settings`).
- Pasta de importação: `./data/import`. Arquivos locais nomeados como `Artista - Título.mp3` são detectados pelo `localFolderProvider`.
- Migrations são manuais e idempotentes: verificações de coluna em `api/src/db.ts` + `CREATE TABLE IF NOT EXISTS`.
- **Atenção:** ao iniciar, `resumeDownloads()` enfileira **todas** as faixas com `download_status = 'pending'`.

## Downloads e fontes de áudio

- O downloader (`api/src/services/downloader.ts`) tenta primeiro arquivo local em `IMPORT_DIR`, depois busca a faixa em uma fonte externa via `externalProvider` (`api/src/services/external.ts`).
- O container da API já inclui `ffmpeg`, `python3` e o `yt-dlp` (versão fixada em `api/Dockerfile`). Não é necessário instalar no host quando usa Docker.
- Metadados externos vêm de `api/src/services/catalogApi.ts`. Identificadores externos usam o prefixo `catalog:`; a migração em `api/src/db.ts` converte prefixos legados ao iniciar.
- A tabela `tracks` possui a coluna `last_played_at`. O endpoint `POST /api/tracks/:id/played` registra a reprodução; o player chama esse endpoint ao iniciar uma faixa.
- A tela inicial mostra o espaço usado pelas músicas baixadas via `GET /api/library/usage`.
- A configuração `cleanupUnusedAfterDays` (0 = desativado) define em quantos dias faixas baixadas e não tocadas são removidas automaticamente pelo scheduler (`api/src/services/cleanup.ts`); o valor de 180 dias está disponível na UI.
- Configuração de cookies do YouTube (`api/src/settings.ts`): o usuário cola o conteúdo do arquivo de cookies diretamente no modal de configurações; o backend salva em `./data/youtube-cookies.txt` e o `yt-dlp` recebe `--cookies <caminho>` em downloads e streams. Inclui painel com passo a passo e alerta de risco de bloqueio/limitação da conta Google.
- O `externalProvider` (`api/src/services/external.ts`) usa `--extractor-args "youtube:player_client=android"` para contornar restrições SABR que bloqueiam o cliente web.
- Downloads e streams tentam primeiro **sem cookies** (conexão anônima); apenas se essa tentativa falhar e houver cookies configurados é que os cookies são usados. Isso evita que contas no experimento SABR-only do YouTube fiquem sem formatos de áudio disponíveis.
- Nome final dos arquivos: `Artista - Álbum - Título.mp3`.
- Status de download (`pending` | `downloading` | `ready` | `failed`) fica na tabela `tracks`. O endpoint `GET /api/albums/:id` normaliza o status pela existência real do arquivo no disco: se o arquivo existe, é `ready`; se não existe, nunca é `ready`.

## Convenções de código

- API e frontend usam ESM (`"type": "module"`).
- Não há linter/formatter configurado. Siga o estilo existente.
- A API usa `HttpError` (`api/src/http.ts`) para erros HTTP; o middleware central converte em JSON `{ error: ... }`.
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
- O `file_path` na tabela `tracks` é relativo a `getEffectiveMediaDir()`. Verifique a existência do arquivo antes de confiar em `download_status = 'ready'`.
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
- Playlists: criar, editar, excluir, adicionar/remover/reordenar faixas, buscar músicas na biblioteca para adicionar e sugestões por gênero (até 10 faixas).
- Tela de álbum (`frontend/src/views/AlbumView.tsx`) mostrando faixas baixadas e não baixadas, com botão "Importar" e barra de progresso do download.
- Pré-visualização de álbum (`frontend/src/views/AlbumPreviewView.tsx`) com importação individual, importação do álbum inteiro e barra de progresso do download.
- Controle de volume funcional (mute/unmute + slider).
- Histórico das últimas 10 buscas, persistido em `localStorage`.
- Endpoint `GET /api/tracks/:id/progress` retorna percentual e status do download, também verificando a existência real do arquivo no disco.
- Normalização de status no endpoint de álbum pela existência real do arquivo em disco.
- Toast/notificações globais (`frontend/src/notice.ts` + `frontend/src/components/NoticeContainer.tsx`) exibem alertas de erro quando todas as faixas (ou parte delas) de um álbum falham no download.
- Tela de álbum exibe indicador "Erro" nas faixas com `download_status = 'failed'`.
- Modal de confirmação customizado (`frontend/src/components/ConfirmModal.tsx`) para exclusão de álbuns, faixas e playlists, substituindo o `confirm` nativo do navegador.
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
- O Service Worker do PWA está habilitado também em desenvolvimento (`devOptions.enabled: true`). Se comportamentos estranhos de cache atrapalharem o hot reload, desabilite temporariamente no `vite.config.ts` ou use uma aba anônima.
