import { useState, useMemo } from 'react';
import { TableHead } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, ArrowUpDown, Filter, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type SortDir = 'asc' | 'desc' | null;

interface FilterableHeadProps {
  label: string;
  sortActive: boolean;
  sortDir: SortDir;
  onSort: () => void;
  uniqueValues: string[];
  selectedValues: Set<string>;
  onFilterChange: (values: Set<string>) => void;
  className?: string;
}

export function FilterableHead({
  label,
  sortActive,
  sortDir,
  onSort,
  uniqueValues,
  selectedValues,
  onFilterChange,
  className,
}: FilterableHeadProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return uniqueValues;
    const q = search.toLowerCase();
    return uniqueValues.filter(v => v.toLowerCase().includes(q));
  }, [uniqueValues, search]);

  const toggleValue = (val: string) => {
    const next = new Set(selectedValues);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onFilterChange(next);
  };

  const selectAll = () => onFilterChange(new Set());
  const selectNone = () => onFilterChange(new Set(filtered));

  const filterCount = selectedValues.size;

  return (
    <TableHead className={cn('select-none', className)}>
      <div className="inline-flex items-center gap-0.5">
        <span className="cursor-pointer hover:text-foreground inline-flex items-center gap-1" onClick={onSort}>
          {label}
          {!sortActive && <ArrowUpDown className="w-3 h-3 text-muted-foreground" />}
          {sortActive && sortDir === 'asc' && <ArrowUp className="w-3 h-3" />}
          {sortActive && sortDir === 'desc' && <ArrowDown className="w-3 h-3" />}
        </span>
        {uniqueValues.length > 0 && (
          <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
            <PopoverTrigger asChild>
              <button className="relative p-1 rounded hover:bg-muted/80" onClick={e => e.stopPropagation()}>
                <Filter className={cn("w-3 h-3", filterCount > 0 ? 'text-primary' : 'text-muted-foreground')} />
                {filterCount > 0 && (
                  <Badge variant="default" className="absolute -top-1.5 -right-1.5 h-3.5 min-w-[14px] p-0 flex items-center justify-center text-[8px] leading-none">
                    {filterCount}
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start" onClick={e => e.stopPropagation()}>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-7 h-8 text-xs"
                  placeholder="Buscar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={selectAll}>
                  Todos
                </Button>
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={selectNone}>
                  Nenhum
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {filtered.map(val => {
                  const isExcluded = selectedValues.has(val);
                  return (
                    <label key={val} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted/50 cursor-pointer text-xs">
                      <Checkbox
                        checked={!isExcluded}
                        onCheckedChange={() => toggleValue(val)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="truncate">{val || '(vazio)'}</span>
                    </label>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum valor encontrado</p>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        )}
      </div>
    </TableHead>
  );
}
