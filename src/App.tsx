import { useHashRoute } from './demo/useHashRoute';
import { AdminPage } from './pages/AdminPage';
import { BuyerPage } from './pages/BuyerPage';

export default function App() {
  const route = useHashRoute();
  return route.startsWith('/admin') ? <AdminPage /> : <BuyerPage />;
}
