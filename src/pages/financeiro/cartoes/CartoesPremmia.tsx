import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ImportarVendas from './ImportarVendas';
import Conferencia from './Conferencia';
import VendasImportadas from './VendasImportadas';

const TAB_DEFS = [
  { value: 'importar',    label: 'Importar Vendas',  permission: 'cartoes-importar',    Component: ImportarVendas  },
  { value: 'conferencia', label: 'Conferência',       permission: 'cartoes-conferencia', Component: Conferencia     },
  { value: 'vendas',      label: 'Vendas Importadas', permission: 'cartoes-vendas',      Component: VendasImportadas },
] as const;

export default function CartoesPremmia() {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const visibleTabs = TAB_DEFS.filter((t) => hasPermission(t.permission));

  const paramTab   = searchParams.get('tab') ?? '';
  const activeTab  = visibleTabs.find((t) => t.value === paramTab)?.value
    ?? visibleTabs[0]?.value
    ?? 'importar';

  if (visibleTabs.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Sem permissão de acesso.
      </p>
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}
    >
      {/* Scrollable tabs — mobile-first */}
      <div className="overflow-x-auto pb-px">
        <TabsList className="flex h-auto min-w-max rounded-md p-1 gap-0">
          {visibleTabs.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="whitespace-nowrap text-sm px-4 py-1.5"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {visibleTabs.map(({ value, Component }) => (
        <TabsContent
          key={value}
          value={value}
          className="mt-4 focus-visible:outline-none focus-visible:ring-0"
        >
          <Component />
        </TabsContent>
      ))}
    </Tabs>
  );
}
