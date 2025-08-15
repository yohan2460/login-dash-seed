import { Routes, Route } from "react-router-dom";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ModernDashboard from "./pages/ModernDashboard";
import FacturasPorProveedor from "./pages/FacturasPorProveedor";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/dashboard" element={<ModernDashboard />} />
      <Route path="/facturas-por-proveedor" element={<FacturasPorProveedor />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;