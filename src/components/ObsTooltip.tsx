import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Renders truncated observation text with a tooltip showing the full content on hover.
 * Requires TooltipProvider in the component tree (already in App.tsx).
 */
export function ObsTooltip({
  text,
  maxWidth = 'max-w-[160px]',
  emptyLabel = '—',
}: {
  text: string | null | undefined;
  maxWidth?: string;
  emptyLabel?: string;
}) {
  if (!text) return <span className="text-muted-foreground">{emptyLabel}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`truncate block ${maxWidth} cursor-default`}>{text}</span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-xs break-words">
        <p className="text-sm whitespace-pre-wrap">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}
