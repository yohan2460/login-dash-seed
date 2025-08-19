import { Routes, Route } from "react-router-dom";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ModernDashboard from "./pages/ModernDashboard";
import FacturasPorProveedor from "./pages/FacturasPorProveedor";
import Informes from "./pages/Informes";
import Usuarios from "./pages/Usuarios";
import { DashboardProvider } from "./contexts/DashboardContext";

function App() {
  return (
    <DashboardProvider>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<ModernDashboard />} />
        <Route path="/facturas-por-proveedor" element={<FacturasPorProveedor />} />
        <Route path="/informes" element={<Informes />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </DashboardProvider>
  );
}

export default App;