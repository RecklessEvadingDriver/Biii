import { useHashRouter } from './hooks/useHashRouter';
import HomePage from './components/HomePage';
import WatchRoom from './components/WatchRoom';
import { isSupabaseConfigured, supabaseConfigError } from './lib/supabase';

function App() {
  const { roomId } = useHashRouter();

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-xl font-semibold text-red-300">Configuration Error</h1>
          <p className="mt-2 text-sm text-red-100">{supabaseConfigError}</p>
        </div>
      </div>
    );
  }

  if (roomId) {
    return <WatchRoom roomId={roomId} />;
  }

  return <HomePage />;
}

export default App;
