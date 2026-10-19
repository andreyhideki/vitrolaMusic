import { useEffect, useState } from 'react';
import { api, AppSettings, TrackDto } from './api';
import { useLibrary } from './library';
import { useNav, View } from './nav';
import { usePlayerStore } from './player/store';
import { PlayerAudioConfig, usePlayerAudio } from './player/usePlayerAudio';
import { Sidebar } from './components/Sidebar';
import { PlayerBar } from './components/PlayerBar';
import { LibraryView } from './views/LibraryView';
import { SearchView } from './views/SearchView';
import { AlbumView } from './views/AlbumView';
import { PlaylistsView } from './views/PlaylistsView';
import { PlaylistView } from './views/PlaylistView';
import { ArtistView } from './views/ArtistView';
import { AlbumPreviewView } from './views/AlbumPreviewView';

function Main({ view }: { view: View }) {
  switch (view.kind) {
    case 'library':
      return <LibraryView />;
    case 'search':
      return <SearchView />;
    case 'album':
      return <AlbumView id={view.id} />;
    case 'albumPreview':
      return <AlbumPreviewView deezerId={view.deezerId} />;
    case 'playlists':
      return <PlaylistsView />;
    case 'playlist':
      return <PlaylistView id={view.id} />;
    case 'artist':
      return <ArtistView id={view.id} />;
  }
}

let streamWithoutDownload = false;

export function App() {
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    api<AppSettings>('/settings')
      .then((s) => {
        streamWithoutDownload = s.streamWithoutDownload;
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));

    const id = usePlayerStore.getState().currentTrackId;
    if (id && !useLibrary.getState().byId[id]) {
      api<TrackDto>(`/tracks/${id}`)
        .then((t) => useLibrary.getState().upsert([t]))
        .catch(() => {});
    }
  }, []);

  const playerConfig: PlayerAudioConfig = {
    isReady: (id) => {
      const track = useLibrary.getState().byId[id];
      if (track?.downloadStatus === 'ready') return true;
      return streamWithoutDownload;
    },
    getMeta: (id) => {
      const t = useLibrary.getState().byId[id];
      if (!t) return null;
      return {
        title: t.title,
        artist: t.artistName,
        album: t.albumTitle,
        coverUrl: t.coverUrl ?? undefined,
      };
    },
    streamUrl: (id) => {
      const track = useLibrary.getState().byId[id];
      if (track?.downloadStatus === 'ready') return `/api/tracks/${id}/stream`;
      if (streamWithoutDownload) return `/api/tracks/${id}/stream-url`;
      return `/api/tracks/${id}/stream`;
    },
  };

  usePlayerAudio(playerConfig);
  const view = useNav((s) => s.view);

  if (!settingsLoaded) return null;

  return (
    <div className="app">
      <Sidebar />
      <main>
        <Main view={view} />
      </main>
      <PlayerBar />
    </div>
  );
}
