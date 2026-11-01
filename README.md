# Vitrola Music

Player de áudio web com busca por música, artista ou álbum, capas e metadados, playlists, reprodução sequencial ou aleatória, fila de reprodução e downloads de faixas para a biblioteca local.

```
vitrolaMusic/
├── api/        # Express 5 + SQLite (busca, metadados, playlists, streaming com Range)
└── frontend/   # React + Vite + TypeScript + Zustand (player, fila, interface)
```

## Como rodar

### Com Docker (recomendado)

Requisito: Docker com Compose v2 (Docker Desktop ou Docker Engine).

```bash
make up        # constrói as imagens e sobe API + frontend em segundo plano
```

- Frontend: http://localhost:5173
- API: http://localhost:5172/api/health

Os arquivos são montados por volume, então as alterações no código recarregam sozinhas. Os dados ficam em `./data` no host (banco, mídia e a pasta `./data/import`).

Principais comandos (`make help` lista todos):

| Comando | Função |
|---|---|
| `make up` | Sobe os containers (com build) |
| `make down` | Para os containers |
| `make logs` | Acompanha os logs |
| `make ps` | Estado dos containers |
| `make test` | Roda os testes da fila do player |
| `make typecheck` | Verifica tipos da API e do frontend |
| `make shell-api` / `make shell-web` | Abre um shell em cada container |
| `make reset` | Recria os volumes de `node_modules` (após mudar dependências) |
| `make clean` | Remove containers, volumes e imagens do projeto (não apaga `./data`) |

### Sem Docker

Requisitos: Node.js 20+, uma ferramenta de download de mídia e ffmpeg no PATH.

```bash
# Exemplo no Ubuntu/Debian:
# sudo apt install ffmpeg python3-pip
# Instale também a ferramenta de download de mídia de sua preferência.

make local-install                 # instala dependências de api/ e frontend/
cd api && npm run dev              # http://localhost:5172
cd frontend && npm run dev         # http://localhost:5173
```

### Variáveis de ambiente (opcionais)

| Variável | Padrão | Função |
|---|---|---|
| `PORT` | `5172` | Porta da API |
| `DATA_DIR` | `./data` | Banco SQLite e pasta de mídia |
| `IMPORT_DIR` | `./data/import` | Pasta onde você coloca os arquivos de áudio que possui |
| `CORS_ORIGIN` | `http://localhost:5173` | Origem permitida no CORS |

## Como as músicas chegam ao player

1. Você busca na barra de pesquisa. A API consulta um catálogo público externo (metadados e capas, sem áudio).
2. Ao importar uma faixa ou álbum, a API cria os registros locais e enfileira o download.
3. O download usa **fontes de áudio** (`api/src/services/downloader.ts`). A ordem de busca é:
   1. `localFolderProvider`: procura o arquivo na pasta `IMPORT_DIR` pelo nome (`Artista - Título.mp3`, por exemplo) e copia para `data/media`.
   2. provedor externo: se não encontrar localmente, busca a faixa em uma fonte externa de áudio, converte para MP3 e salva em `data/media`.
4. Quando a faixa fica `ready`, o player toca via `/api/tracks/:id/stream`, com suporte a HTTP `Range`.

> **Aviso legal:** O download de áudio de fontes externas pode violar os Termos de Serviço da plataforma e/ou direitos autorais. Use essa funcionalidade apenas para conteúdo que você tem permissão de baixar e reproduzir. O projeto também continua suportando arquivos locais e músicas com licença livre.

## Estrutura da API

| Método | Rota | Função |
|---|---|---|
| GET | `/api/search?q=` | Busca na biblioteca local, playlists locais e no catálogo externo |
| POST | `/api/import/track` | Importa uma faixa do catálogo e enfileira o download |
| POST | `/api/import/album` | Importa um álbum com todas as faixas |
| GET | `/api/albums/:id` | Álbum com capa e faixas (status normalizado pela existência do arquivo) |
| GET | `/api/preview/album?catalogId=` | Pré-visualização de álbum do catálogo externo |
| GET | `/api/artists/:id` | Artista com discografia local |
| GET | `/api/tracks/:id` | Status de uma faixa |
| GET | `/api/tracks/:id/progress` | Percentual e status do download |
| POST | `/api/tracks/:id/download` | Tenta baixar de novo |
| POST | `/api/tracks/:id/played` | Registra que a faixa foi reproduzida |
| GET | `/api/tracks/:id/stream` | Streaming do áudio (206 Partial Content) |
| GET | `/api/tracks/:id/stream-url` | URL de stream direto da fonte externa (modo sem download) |
| GET/POST | `/api/playlists` | Lista e cria playlists |
| GET/PATCH/DELETE | `/api/playlists/:id` | Detalhe, edição e exclusão |
| POST | `/api/playlists/:id/tracks` | Adiciona faixas ao fim |
| GET | `/api/playlists/:id/suggestions` | Sugestões de faixas pelo gênero dominante |
| DELETE | `/api/playlists/:id/entries/:entryId` | Remove um item |
| PATCH | `/api/playlists/:id/order` | Reordena os itens |
| GET | `/api/library/search?q=` | Busca faixas na biblioteca local |
| GET | `/api/library/usage` | Espaço em disco usado pelas faixas baixadas |
| GET/POST | `/api/settings` | Lê/altera configurações (qualidade, pasta de mídia, stream, limpeza) |
| POST | `/api/plays` | Registra uma reprodução (com tempo ouvido e pulo) |
| GET | `/api/analytics?period=` | Estatísticas de plays por semana, mês ou ano |

## Funcionalidades do player

- Reprodução de playlist ou álbum em ordem sequencial ou aleatória (shuffle sem repetir antes de tocar todas).
- Ligar ou desligar o shuffle sem interromper a faixa atual.
- Repetir: desligado, playlist inteira ou faixa atual.
- "Tocar a seguir" e "Adicionar à fila" (fila avulsa com prioridade).
- Pula faixas que ainda não foram baixadas e faixas com erro.
- Pré-carregamento da próxima faixa e integração com Media Session (controles do sistema e tela de bloqueio).
- Volume persistido durante a troca de faixas: o áudio não volta para o máximo ao iniciar outra música.
- Registra cada reprodução (total ou parcial) e contabiliza pulos para estatísticas.
- Player fixo na parte inferior, sempre visível mesmo com scroll longo.
- Fila e configurações salvas em `localStorage`, para restaurar após recarregar a página.

## Funcionalidades da interface

- **Tema claro/escuro:** alternância persistente no topo da aplicação.
- **Sidebar colapsável:** menu lateral pode exibir apenas ícones e logo reduzido; estado persistido; scroll independente do conteúdo.
- **Navegação voltar/avançar:** botões no topo permitem retornar e avançar entre telas, preservando filtros e resultados de busca.
- **Home/dashboard:** saudação, contagem de álbuns/faixas/playlists, espaço usado em disco e ações rápidas "Tocar tudo" / "Aleatório".
- **Carrossel de álbuns:** na home os álbuns ficam em um carrossel horizontal arrastável, com setas < > ao lado do título para navegar de 1 a 3 álbuns por clique.
- **Capas de álbum com play:** botão verde de play em destaque nas capas para tocar o álbum direto da home; muda para pause vermelho quando o álbum está sendo reproduzido.
- **Busca unificada:** resultados ordenados em Álbuns, Playlists (locais) e Músicas; campo de busca fixo ao rolar; botão de limpar texto dentro do input; artistas clicáveis para nova busca.
- **Histórico de buscas:** as últimas 10 buscas ficam salvas e podem ser reexecutadas.
- **Download com progresso:** telas de álbum e pré-visualização mostram barra de progresso ao importar faixas.
- **Modal de confirmação:** exclusões de álbuns, faixas e playlists usam um modal customizado.
- **Playlists:** adicionar, remover, reordenar, buscar músicas na biblioteca e receber sugestões por gênero (até 10 faixas).
- **Paranoic (analytics):** tela acessível pelo menu inferior com estatísticas de reprodução — totalizadores, ranking por música/artista/álbum/gênero e gráficos por dia, semana, mês ou ano.
- **Limpeza automática:** opção de remover faixas baixadas e não tocadas após 180 dias.
- **PWA:** manifest, ícones e Service Worker para instalação.

## Próximos passos sugeridos

- Persistir a fila no servidor, se quiser sincronizar entre dispositivos.
- Reordenar por arrastar e soltar (`dnd-kit`), no lugar dos botões ↑ ↓.
- Trocar o SQLite por PostgreSQL e as tarefas em memória por BullMQ + Redis, se a carga crescer.
