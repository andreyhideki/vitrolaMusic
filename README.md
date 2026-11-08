# Vitrola Music

Player de áudio web com busca por música, artista ou álbum, capas e metadados, playlists, reprodução sequencial ou aleatória, fila de reprodução e downloads de faixas para a biblioteca local.

```
vitrolaMusic/
├── api/        # Express 5 + SQLite (busca, metadados, playlists, streaming com Range)
└── frontend/   # React + Vite + TypeScript + Zustand (player, fila, interface)
```

## Buy me a Coffee

Se o Vitrola Music te ajudou e você quer apoiar o desenvolvimento:

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-%23FFDD00.svg?&style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buy.stripe.com/test_7sY28rfSV9yh6Edccn9IQ00)

## Leve e autocontido

O Vitrola Music foi pensado para rodar com pouca infraestrutura:

- **Apenas dois containers** (API + frontend).
- **Banco de dados local** com SQLite — não precisa de PostgreSQL, MySQL ou serviço externo.
- **Fila de downloads simples** em memória — não precisa de Redis, BullMQ ou RabbitMQ.
- **Uso de RAM em execução** (medido com `docker stats` em ambiente de desenvolvimento):
  - API: ~100 MB
  - Frontend: ~140 MB

> Os números podem variar conforme a carga, mas a aplicação inteira costuma rodar confortavelmente em menos de 300 MB de RAM. As imagens Docker são maiores por incluírem Node.js, ffmpeg, Python e o `yt-dlp`, mas o consumo em runtime é baixo.

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
| `ALLOWED_HOSTS` | _(vazio)_ | Nomes extras aceitos no header `Host`, além de IPs, `localhost` e `api` (proteção contra DNS rebinding) |
| `AUTH_TOKEN` | _(gerado)_ | Token de acesso. Se vazio, é gerado em `./data/auth-token.txt` |
| `AUTH_DISABLED` | `false` | `true` desliga a autenticação (só para testes locais; nunca com `VITROLA_BIND=0.0.0.0`) |
| `VITROLA_BIND` | `127.0.0.1` | Interface onde o frontend é publicado pelo Docker (`0.0.0.0` = rede) |

### Acesso e uso no celular

O Vitrola exige um **token de acesso**. Na primeira execução ele é gerado em `./data/auth-token.txt`; veja com:

```bash
make token
```

Por padrão o app só é acessível neste computador. Para usar no celular (mesma rede Wi-Fi):

1. Crie um `.env` na raiz (modelo em `.env.example`) com `VITROLA_BIND=0.0.0.0` e rode `make up`.
2. **Android:** libere o acesso à rede local para o navegador (veja abaixo). Sem isso a página não abre.
3. No celular, abra `http://IP-DO-COMPUTADOR:5173` e digite o token. Atalho: `http://IP-DO-COMPUTADOR:5173/#token=SEU-TOKEN` faz login direto.
4. A sessão dura 1 ano por aparelho. Para revogar todas, apague `./data/auth-token.txt` (ou troque `AUTH_TOKEN`) e reinicie a API.

Scripts podem usar `Authorization: Bearer <token>`.

#### Android: permissão de rede local (obrigatória)

Nas versões recentes do Android, os apps precisam da permissão **"Dispositivos próximos"** (ou **"Rede local"**) para acessar endereços da rede de casa (`192.168.x.x`). Sem ela, o Chrome bloqueia a conexão antes de sair do celular e mostra **`ERR_TOO_MANY_RETRIES`** (ou `ERR_LOCAL_NETWORK_PERMISSION_MISSING`), inclusive na página do roteador.

1. Pressione e segure o ícone do **Chrome** → **Informações do app** (ou Configurações → Apps → Chrome).
2. **Permissões** → **Dispositivos próximos** / **Rede local** → **Permitir**.
3. Feche o Chrome por completo (remova dos apps recentes) e abra de novo.

Vale o mesmo para outros navegadores. O Firefox costuma pedir essa permissão na primeira vez que você abre um endereço local.

#### Se ainda não abrir no celular

- Use o IP **de rede do computador** (no Windows, `ipconfig` → "Endereço IPv4" da Ethernet/Wi-Fi), com `http://` explícito.
- Celular e computador precisam estar na mesma rede (não use rede de convidados), sem VPN ativa no celular (Tailscale com exit node, Cloudflare WARP, bloqueadores de anúncio em modo VPN etc.) e sem proxy no Wi-Fi.
- Teste `http://IP-DO-COMPUTADOR:5173/api/health`: se responder `{"ok":true}`, a rede está funcionando.
- **WSL2 + Docker Desktop:** o Docker Desktop já publica a porta no Windows (`0.0.0.0:5173`), não é preciso `portproxy`. Se o Firewall do Windows estiver ativo, libere a porta 5173 para a rede em uso. A Ethernet costuma ficar no perfil **Público**, que bloqueia conexões de entrada.

### Cookies do YouTube (opcional)

Se o seu IP/assinatura de rede estiver sendo bloqueada pelo YouTube, você pode colar o conteúdo do arquivo de cookies da sua conta Google nas configurações da aplicação. O backend salva em `./data/youtube-cookies.txt` e repassa ao `yt-dlp`.

> ⚠️ **Atenção:** contas no experimento **SABR-only** do YouTube podem ficar sem formatos de áudio disponíveis quando usam cookies. Por isso o downloader tenta primeiro uma conexão anônima e só usa os cookies se essa tentativa falhar. Use cookies por sua conta e risco, respeitando os Termos de Serviço do Google.

## Como as músicas chegam ao player

1. Você busca na barra de pesquisa. A API consulta um catálogo público externo (metadados e capas, sem áudio).
2. Ao importar uma faixa ou álbum, a API cria os registros locais e enfileira o download.
3. O download usa **fontes de áudio** (`api/src/services/downloader.ts`). A ordem de busca é:
   1. `localFolderProvider`: procura o arquivo na pasta `IMPORT_DIR` pelo nome (`Artista - Título.mp3`, por exemplo) e copia para `data/media`.
   2. provedor externo (`yt-dlp`): se não encontrar localmente, busca a faixa em uma fonte externa de áudio, converte para MP3 e salva em `data/media`. Para contornar restrições SABR do YouTube, o `yt-dlp` usa `--extractor-args "youtube:player_client=android"` e tenta primeiro **sem cookies**; só usa os cookies configurados se a tentativa anônima falhar.
4. Quando a faixa fica `ready`, o player toca via `/api/tracks/:id/stream`, com suporte a HTTP `Range`.

## ⚖️ Disclaimer / Isenção de Responsabilidade

Este projeto foi desenvolvido estritamente para **fins educacionais e de estudo** sobre engenharia de software, requisições HTTP e manipulação de arquivos de áudio.

* O objetivo aqui é explorar conceitos técnicos — como streaming, filas de download e gerenciamento de bibliotecas. **Não incentivo, facilito ou apoio o download de conteúdo protegido por direitos autorais sem permissão dos titulares**.
* Se você usar a ferramenta para baixar mídia de plataformas terceiras, o faz por sua conta e risco. É sua responsabilidade respeitar os **Termos de Serviço** de cada plataforma e a **legislação de direitos autorais vigente no seu país**.
* O autor e contribuidores **não se responsabilizam** por eventuais problemas — como penalidades legais, suspensão de contas, perda de dados ou danos — causados por um uso inadequado do software.
* O uso recomendado é com **arquivos locais que você já possui**, conteúdo de **domínio público** ou mídia licenciada para uso pessoal.

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
