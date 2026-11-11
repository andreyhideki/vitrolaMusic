import { useEffect, useState } from 'react';
import { api, AppSettings, TrackDto } from './api';
import { useLibrary } from './library';
import { useNav, View } from './nav';
import { useSidebarCollapsed, useUi } from './ui';
import { useScreenSize } from './useMediaQuery';
import { usePlayerStore } from './player/store';
import { PlayerAudioConfig, playerControls, usePlayerAudio } from './player/usePlayerAudio';
import { useTheme } from './theme';
import { platform } from './platform';
import { takeTokenFromUrl, useAuth } from './auth';
import { LoginView } from './views/LoginView';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PlayerBar } from './components/PlayerBar';
import { PwaReloadPrompt } from './components/PwaReloadPrompt';
import { NoticeContainer } from './components/NoticeContainer';
import { LibraryView } from './views/LibraryView';
import { SearchView } from './views/SearchView';
import { AlbumView } from './views/AlbumView';
import { PlaylistsView } from './views/PlaylistsView';
import { PlaylistView } from './views/PlaylistView';
import { ArtistView } from './views/ArtistView';
import { AlbumPreviewView } from './views/AlbumPreviewView';
import { AnalyticsView } from './views/AnalyticsView';

function Main({ view }: { view: View }) {
  switch (view.kind) {
    case 'library':
      return <LibraryView />;
    case 'search':
      return <SearchView />;
    case 'album':
      return <AlbumView id={view.id} />;
    case 'albumPreview':
      return <AlbumPreviewView catalogId={view.catalogId} />;
    case 'playlists':
      return <PlaylistsView />;
    case 'playlist':
      return <PlaylistView id={view.id} />;
    case 'artist':
      return <ArtistView id={view.id} />;
    case 'analytics':
      return <AnalyticsView />;
  }
}

let streamWithoutDownload = false;

export function App() {
  const theme = useTheme((s) => s.theme);
  const status = useAuth((s) => s.status);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
  }, [theme]);

  useEffect(() => {
    const { check, login } = useAuth.getState();
    const fromUrl = takeTokenFromUrl();
    if (!fromUrl) {
      void check();
      return;
    }
    login(fromUrl).catch((err) => {
      setLoginError(err instanceof Error ? err.message : String(err));
      void check();
    });
  }, []);

  if (status === 'unknown') return null;
  if (status === 'unauthenticated') return <LoginView initialError={loginError} />;
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    api<AppSettings>('/settings')
      .then((s) => {
        streamWithoutDownload = s.streamWithoutDownload;
        playerControls.configure({ crossfadeSeconds: s.crossfadeSeconds, normalizeVolume: s.normalizeVolume });
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
    getLoudness: (id) => {
      const track = useLibrary.getState().byId[id];
      return track?.downloadStatus === 'ready' ? track.loudnessLufs : null;
    },
    streamUrl: (id) => {
      const track = useLibrary.getState().byId[id];
      const url = track?.downloadStatus !== 'ready' && streamWithoutDownload
        ? `/api/tracks/${id}/stream-url`
        : `/api/tracks/${id}/stream`;
      return platform.resolveStreamUrl ? platform.resolveStreamUrl(id, url) : url;
    },
  };

  usePlayerAudio(playerConfig);
  const view = useNav((s) => s.view);
  const screen = useScreenSize();
  const sidebarCollapsed = useSidebarCollapsed();
  const drawerOpen = useUi((s) => s.drawerOpen);
  const closeDrawer = useUi((s) => s.closeDrawer);

  useEffect(() => {
    useUi.getState().setScreen(screen);
  }, [screen]);

  // No mobile, fecha a gaveta ao navegar.
  useEffect(() => {
    closeDrawer();
  }, [view, closeDrawer]);

  if (!settingsLoaded) return null;

  return (
    <div
      className={`app screen-${screen} ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${
        drawerOpen ? 'drawer-open' : ''
      }`}
    >
      <Sidebar />
      {screen === 'mobile' && drawerOpen && (
        <div className="drawer-backdrop" onClick={closeDrawer} aria-hidden="true" />
      )}
      <div className="main-area">
        <Header />
        <main>
          <Main view={view} />
        </main>
      </div>
      <PlayerBar />
      <PwaReloadPrompt />
      <NoticeContainer />
    </div>
  );
}
