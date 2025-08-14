import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn, UserPlus, Sparkles } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();

  // Si está autenticado, redirigir al dashboard
  if (user && !loading) {
    return <Navigate to="/dashboard" replace />;
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
            Bienvenido a tu App
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-lg mx-auto">
            Una aplicación con diseño limpio y suave. Inicia sesión para acceder a tu dashboard personal.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Card className="shadow-medium transition-all duration-300 hover:shadow-large hover:scale-[1.02]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="w-5 h-5 text-primary" />
                Iniciar Sesión
              </CardTitle>
              <CardDescription>
                Accede a tu cuenta existente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full transition-all duration-300 hover:scale-105">
                <a href="/auth">Entrar</a>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-medium transition-all duration-300 hover:shadow-large hover:scale-[1.02]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                Crear Cuenta
              </CardTitle>
              <CardDescription>
                Únete y crea tu cuenta nueva
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild className="w-full transition-all duration-300 hover:scale-105">
                <a href="/auth">Registrarse</a>
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
