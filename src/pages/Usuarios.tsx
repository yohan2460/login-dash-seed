import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Users, Trash2, Shield } from 'lucide-react';

interface User {
  id: string;
  email: string;
  created_at: string;
  display_name?: string;
}

interface UserRole {
  user_id: string;
  role: string;
}

export default function Usuarios() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<User[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: ''
  });

  useEffect(() => {
    if (user) {
      console.log('🚀 Initial data fetch for authenticated user');
      fetchUsers();
      fetchUserRoles();
    }
  }, [user]);

  // Add real-time subscription for user changes
  useEffect(() => {
    if (!user) return;

    console.log('📡 Setting up realtime subscriptions');
    
    // Subscribe to profiles changes
    const profilesChannel = supabase
      .channel('profiles-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          console.log('📡 Profiles change detected:', payload.eventType);
          fetchUsers();
        }
      )
      .subscribe();

    // Subscribe to user_roles changes  
    const rolesChannel = supabase
      .channel('user-roles-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_roles'
        },
        (payload) => {
          console.log('📡 User roles change detected:', payload.eventType);
          fetchUserRoles();
        }
      )
      .subscribe();

    return () => {
      console.log('🔌 Cleaning up realtime subscriptions');
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(rolesChannel);
    };
  }, [user]);

  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      
      // Get all profiles with more robust query
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(`
          user_id, 
          display_name,
          created_at
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching profiles:', error);
        throw error;
      }

      console.log('📊 Fetched profiles:', profiles?.length || 0);

      // Transform to user format with better data handling
      const userList = profiles?.map(profile => ({
        id: profile.user_id,
        email: profile.display_name || 'Sin email',
        created_at: profile.created_at || new Date().toISOString(),
        display_name: profile.display_name
      })) || [];

      console.log('👥 Setting users:', userList.length);
      setUsers(userList);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los usuarios",
        variant: "destructive"
      });
      setUsers([]); // Reset on error
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchUserRoles = async () => {
    try {
      console.log('🔄 Fetching user roles...');
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role');
      
      if (error) {
        console.error('Error fetching user roles:', error);
        throw error;
      }
      
      console.log('🛡️ Fetched roles:', data?.length || 0);
      setUserRoles(data || []);
    } catch (error) {
      console.error('Error fetching user roles:', error);
      setUserRoles([]); // Reset on error
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      toast({
        title: "Error",
        description: "Email y contraseña son obligatorios",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsCreating(true);

      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: formData.email,
          password: formData.password,
          displayName: formData.displayName || formData.email
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      console.log('✅ User creation successful');
      
      toast({
        title: "Usuario creado",
        description: `Usuario ${formData.email} creado exitosamente`,
      });

      setFormData({ email: '', password: '', displayName: '' });
      setIsCreateDialogOpen(false);
      
      // Force refresh with small delay to ensure backend is updated
      console.log('🔄 Refreshing user data after creation...');
      setTimeout(async () => {
        await Promise.all([
          fetchUsers(),
          fetchUserRoles()
        ]);
        console.log('✅ Data refresh after creation completed');
      }, 500);

    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: "Error al crear usuario",
        description: error.message || 'Error desconocido',
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      console.log('🗑️ Starting user deletion:', userId);
      setDeletingUserId(userId);

      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId }
      });

      if (error) {
        console.error('❌ Function invocation error:', error);
        throw error;
      }

      if (data.error) {
        console.error('❌ Function returned error:', data.error);
        throw new Error(data.error);
      }

      console.log('✅ User deletion successful');
      
      toast({
        title: "Usuario eliminado",
        description: "El usuario ha sido eliminado exitosamente",
      });

      // Force refresh with small delay to ensure backend is updated
      console.log('🔄 Refreshing user data...');
      setTimeout(async () => {
        await Promise.all([
          fetchUsers(),
          fetchUserRoles()
        ]);
        console.log('✅ Data refresh completed');
      }, 500);

    } catch (error: any) {
      console.error('❌ Error deleting user:', error);
      toast({
        title: "Error al eliminar usuario",
        description: error.message || 'Error desconocido',
        variant: "destructive"
      });
    } finally {
      setDeletingUserId(null);
    }
  };

  const getUserRole = (userId: string) => {
    const userRole = userRoles.find(ur => ur.user_id === userId);
    return userRole?.role || 'Sin rol';
  };

  if (loading || loadingUsers) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-lg">Cargando usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8" />
              Gestión de Usuarios
            </h1>
            <p className="text-muted-foreground">Administra los usuarios del sistema</p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Crear Usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                <DialogDescription>
                  Todos los usuarios creados tendrán permisos de administrador
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateUser}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="usuario@ejemplo.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña *</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Nombre a mostrar</Label>
                    <Input
                      id="displayName"
                      type="text"
                      placeholder="Nombre completo (opcional)"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    disabled={isCreating}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? "Creando..." : "Crear Usuario"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Usuarios</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administradores</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userRoles.filter(ur => ur.role === 'admin').length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuarios Activos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Usuarios</CardTitle>
            <CardDescription>
              Gestiona todos los usuarios del sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No hay usuarios registrados</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email / Nombre</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((userItem) => (
                    <TableRow key={userItem.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{userItem.display_name || userItem.email}</div>
                          {userItem.display_name && (
                            <div className="text-sm text-muted-foreground">{userItem.email}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-green-600" />
                          <span className="capitalize font-medium text-green-600">
                            {getUserRole(userItem.id)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                          Activo
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={userItem.id === user?.id || deletingUserId === userItem.id}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente la cuenta de usuario "{userItem.display_name || userItem.email}" y todos sus datos asociados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUser(userItem.id)}
                                className="bg-red-600 hover:bg-red-700"
                                disabled={deletingUserId === userItem.id}
                              >
                                {deletingUserId === userItem.id ? "Eliminando..." : "Eliminar"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}