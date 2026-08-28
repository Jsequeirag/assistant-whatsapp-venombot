export const PRIORITY_META = {
  alta: { label: "Alta", cls: "ds-priority-badge alta", rank: 0 },
  media: { label: "Media", cls: "ds-priority-badge media", rank: 1 },
  baja: { label: "Baja", cls: "ds-priority-badge baja", rank: 2 },
};

export const priorityRank = (p) => PRIORITY_META[p]?.rank ?? 1;

export default function PriorityBadge({ priority }) {
  const p = PRIORITY_META[priority] || PRIORITY_META.media;
  return (
    <span className={p.cls}>
      {priority?.toUpperCase() ?? "MEDIA"}
    </span>
  );
}
