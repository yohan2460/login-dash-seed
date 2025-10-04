import { useAuth } from '@/hooks/useAuth';
import { Navigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn, Sparkles } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();

  // Si está autenticado, redirigir a sin-clasificar
  if (user && !loading) {
    return <Navigate to="/sin-clasificar" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="max-w-2xl mx-auto text-center">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="w-20 h-20 bg-gradient-primary rounded-full mx-auto mb-6 flex items-center justify-center shadow-large">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            Sistema de Gestión de Facturas
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-lg mx-auto">
            Inicia sesión para acceder al sistema de gestión de facturas.
          </p>
        </div>

        {/* Action Card */}
        <div className="max-w-md mx-auto mb-8">
          <Card className="shadow-medium transition-all duration-300 hover:shadow-large hover:scale-[1.02]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 justify-center">
                <LogIn className="w-5 h-5 text-primary" />
                Iniciar Sesión
              </CardTitle>
              <CardDescription className="text-center">
                Accede a tu cuenta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full transition-all duration-300 hover:scale-105">
                <Link to="/auth">Entrar</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
            <h3 className="font-medium text-primary mb-1">Diseño Limpio</h3>
            <p className="text-muted-foreground">Interfaz moderna y minimalista</p>
          </div>
          <div className="p-4 rounded-lg bg-gradient-to-br from-secondary/50 to-secondary/20 border border-secondary">
            <h3 className="font-medium mb-1">Fácil de Usar</h3>
            <p className="text-muted-foreground">Navegación intuitiva y simple</p>
          </div>
          <div className="p-4 rounded-lg bg-gradient-to-br from-accent/50 to-accent/20 border border-accent">
            <h3 className="font-medium mb-1">Totalmente Seguro</h3>
            <p className="text-muted-foreground">Autenticación robusta y confiable</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
