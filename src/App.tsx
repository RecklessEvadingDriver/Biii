import { useHashRouter } from './hooks/useHashRouter';
import HomePage from './components/HomePage';
import WatchRoom from './components/WatchRoom';

function App() {
  const { roomId } = useHashRouter();

  if (roomId) {
    return <WatchRoom roomId={roomId} />;
  }

  return <HomePage />;
}

export default App;
