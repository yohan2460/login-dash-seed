import { Routes, Route } from "react-router-dom";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ModernDashboard from "./pages/ModernDashboard";
import FacturasPorProveedor from "./pages/FacturasPorProveedor";
import Informes from "./pages/Informes";
import PagosProximos from "./pages/PagosProximos";
import Usuarios from "./pages/Usuarios";
import { SinClasificar } from "./pages/SinClasificar";
import { MercanciaPendiente } from "./pages/MercanciaPendiente";
import { MercanciaPagada } from "./pages/MercanciaPagada";
import { GastosPendientes } from "./pages/GastosPendientes";
import { GastosPagados } from "./pages/GastosPagados";
import { Sistematizadas } from "./pages/Sistematizadas";
import FacturasPorSerie from "./pages/FacturasPorSerie";
import NotasCredito from "./pages/NotasCredito";
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
        <Route path="/pagos-proximos" element={<PagosProximos />} />
        <Route path="/usuarios" element={<Usuarios />} />

        {/* Rutas por Estado de Facturas */}
        <Route path="/sin-clasificar" element={<SinClasificar />} />
        <Route path="/mercancia-pendiente" element={<MercanciaPendiente />} />
        <Route path="/mercancia-pagada" element={<MercanciaPagada />} />
        <Route path="/gastos-pendientes" element={<GastosPendientes />} />
        <Route path="/gastos-pagados" element={<GastosPagados />} />
        <Route path="/sistematizadas" element={<Sistematizadas />} />
        <Route path="/notas-credito" element={<NotasCredito />} />
        <Route path="/facturas-por-serie" element={<FacturasPorSerie />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </DashboardProvider>
  );
}

export default App;