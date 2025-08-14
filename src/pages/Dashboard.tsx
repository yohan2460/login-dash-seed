import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, User } from 'lucide-react';

export default function Dashboard() {
  const { user, signOut, loading } = useAuth();

  // Redirigir a login si no está autenticado
  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-semibold">Dashboard</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              {user?.email}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSignOut}
              className="transition-all duration-300 hover:scale-105"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Welcome Card */}
          <Card className="mb-8 shadow-medium transition-all duration-300 hover:shadow-large">
            <CardHeader>
              <CardTitle className="text-2xl bg-gradient-primary bg-clip-text text-transparent">
                ¡Bienvenido a tu Dashboard!
              </CardTitle>
              <CardDescription>
                Este es tu espacio personal. Aquí puedes gestionar todo lo que necesites.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                  <h3 className="font-medium text-primary">Usuario Activo</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sesión iniciada correctamente
                  </p>
                </div>
                
                <div className="p-4 rounded-lg bg-gradient-to-br from-secondary/50 to-secondary/20 border border-secondary">
                  <h3 className="font-medium">Perfil Configurado</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tu perfil está listo para usar
                  </p>
                </div>
                
                <div className="p-4 rounded-lg bg-gradient-to-br from-accent/50 to-accent/20 border border-accent">
                  <h3 className="font-medium">Sistema Activo</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Todos los sistemas funcionando
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Empty State */}
          <Card className="text-center shadow-medium">
            <CardContent className="py-12">
              <div className="w-24 h-24 bg-gradient-primary rounded-full mx-auto mb-6 flex items-center justify-center">
                <User className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Tu Dashboard Está Listo</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Este es un dashboard en blanco con una estética limpia y suave. 
                Puedes comenzar a añadir las funcionalidades que necesites.
              </p>
              <Button className="transition-all duration-300 hover:scale-105">
                Comenzar
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}