import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import App from './App.tsx';
import './index.css';
import { Toaster } from "@/components/ui/toaster";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <App />
        <Toaster />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
