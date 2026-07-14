import { ConfirmProvider } from "@/components/ConfirmDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Accounts from "@/pages/Accounts";
import Analytics from "@/pages/Analytics";
import Assistant from "@/pages/Assistant";
import Campaigns from "@/pages/Campaigns";
import Cheques from "@/pages/Cheques";
import Costs from "@/pages/Costs";
import Customers from "@/pages/Customers";
import Expenses from "@/pages/Expenses";
import Development from "@/pages/Development";
import Formulas from "@/pages/Formulas";
import Home from "@/pages/Home";
import Ledgers from "@/pages/Ledgers";
import Marketing from "@/pages/Marketing";
import NotFound from "@/pages/NotFound";
import Orders from "@/pages/Orders";
import Production from "@/pages/Production";
import Products from "@/pages/Products";
import Purchases from "@/pages/Purchases";
import Settings from "@/pages/Settings";
import Stock from "@/pages/Stock";
import Strategy from "@/pages/Strategy";
import Suppliers from "@/pages/Suppliers";
import Tasks from "@/pages/Tasks";
import Templates from "@/pages/Templates";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/siparisler"} component={Orders} />
        <Route path={"/musteriler"} component={Customers} />
        <Route path={"/giderler"} component={Expenses} />
        <Route path={"/kasa"} component={Accounts} />
        <Route path={"/cari"} component={Ledgers} />
        <Route path={"/cek-senet"} component={Cheques} />
        <Route path={"/stok"} component={Stock} />
        <Route path={"/faturalar"} component={Purchases} />
        <Route path={"/urunler"} component={Products} />
        <Route path={"/gelistirme"} component={Development} />
        <Route path={"/formuller"} component={Formulas} />
        <Route path={"/uretim"} component={Production} />
        <Route path={"/maliyet"} component={Costs} />
        <Route path={"/analiz"} component={Analytics} />
        <Route path={"/asistan"} component={Assistant} />
        <Route path={"/pazarlama"} component={Marketing} />
        <Route path={"/kampanyalar"} component={Campaigns} />
        <Route path={"/tedarikciler"} component={Suppliers} />
        <Route path={"/strateji"} component={Strategy} />
        <Route path={"/sablonlar"} component={Templates} />
        <Route path={"/ayarlar"} component={Settings} />
        <Route path={"/gorevler"} component={Tasks} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <ConfirmProvider>
            <Toaster />
            <Router />
          </ConfirmProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
