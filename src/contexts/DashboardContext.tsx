import { createContext, useContext, useState, ReactNode } from 'react';

type CategoryType = 'overview' | 'sin-clasificar' | 'mercancia-pendientes' | 'mercancia-pagadas' | 'gastos-pendientes' | 'gastos-pagados' | 'sistematizada';

interface DashboardContextType {
  activeCategory: CategoryType;
  setActiveCategory: (category: CategoryType) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [activeCategory, setActiveCategory] = useState<CategoryType>('overview');

  return (
    <DashboardContext.Provider value={{ activeCategory, setActiveCategory }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}