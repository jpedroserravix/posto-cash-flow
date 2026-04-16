import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type DatePreset, type DateRange } from '@/hooks/useDateFilter';

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: 'last7', label: '7 dias' },
  { id: 'thisMonth', label: 'Este mês' },
  { id: 'lastMonth', label: 'Mês passado' },
];

interface DateFilterProps {
  preset: DatePreset;
  range: DateRange;
  onChange: (preset: DatePreset, customStart?: string, customEnd?: string) => void;
}

export function DateFilter({ preset, range, onChange }: DateFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={preset === p.id ? 'default' : 'ghost'}
            className="h-9 text-sm px-3"
            onClick={() => onChange(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="hidden sm:block w-px h-5 bg-border" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">De</span>
        <Input
          type="date"
          value={range.start}
          onChange={(e) => onChange('custom', e.target.value, range.end)}
          className="h-9 w-[145px] text-sm"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          type="date"
          value={range.end}
          onChange={(e) => onChange('custom', range.start, e.target.value)}
          className="h-9 w-[145px] text-sm"
        />
      </div>
    </div>
  );
}
