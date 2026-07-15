import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ImportarVendas from './ImportarVendas';
import Conferencia from './Conferencia';
import VendasImportadas from './VendasImportadas';
import AReceber from './AReceber';

export default function CartoesPremmia() {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const showAReceber = hasPermission('cartoes-a-receber');

  const paramTab  = searchParams.get('tab') ?? '';
  const activeTab = paramTab === 'a-receber' && showAReceber ? 'a-receber' : 'cartoes';

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}
    >
      {/* Scrollable on mobile */}
      <div className="overflow-x-auto pb-px">
        <TabsList className="flex h-auto min-w-max rounded-md p-1">
          <TabsTrigger value="cartoes" className="whitespace-nowrap text-sm px-4 py-1.5">
            Cartões e Premmia
          </TabsTrigger>
          {showAReceber && (
            <TabsTrigger value="a-receber" className="whitespace-nowrap text-sm px-4 py-1.5">
              A Receber
            </TabsTrigger>
          )}
        </TabsList>
      </div>

      {/* Tab 1: 3 sections stacked */}
      <TabsContent value="cartoes" className="mt-4 focus-visible:outline-none focus-visible:ring-0">
        <div>
          <ImportarVendas />
          <div className="border-t my-8" />
          <Conferencia />
          <div className="border-t my-8" />
          <VendasImportadas />
        </div>
      </TabsContent>

      {/* Tab 2: A Receber */}
      {showAReceber && (
        <TabsContent value="a-receber" className="mt-4 focus-visible:outline-none focus-visible:ring-0">
          <AReceber />
        </TabsContent>
      )}
    </Tabs>
  );
}
