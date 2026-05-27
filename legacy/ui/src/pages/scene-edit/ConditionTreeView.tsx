export type ConditionTreeChild = {
  nodeId: string;
  label: string;
  description?: string;
};

export type ConditionTreeRoot = {
  nodeId: string;
  label: string;
  description?: string;
  children: ConditionTreeChild[];
};

export function ConditionTreeView({
  roots,
  selectedNodeId,
  emptyText,
  onSelectNode,
}: {
  roots: ConditionTreeRoot[];
  selectedNodeId: string | null;
  emptyText: string;
  onSelectNode: (nodeId: string) => void;
}) {
  if (roots.length === 0) {
    return (
      <p className="rounded border border-dashed border-[var(--app-border)] px-3 py-8 text-center text-sm text-[var(--app-muted)]">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="grid gap-1">
      {roots.map((root) => (
        <div key={root.nodeId} className="grid gap-1">
          <TreeButton
            nodeId={root.nodeId}
            label={root.label}
            description={root.description}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
          {root.children.length > 0 ? (
            <div className="ml-4 grid gap-1 border-l border-[var(--app-border)] pl-2">
              {root.children.map((child) => (
                <TreeButton
                  key={child.nodeId}
                  nodeId={child.nodeId}
                  label={child.label}
                  description={child.description}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={onSelectNode}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TreeButton({
  nodeId,
  label,
  description,
  selectedNodeId,
  onSelectNode,
}: {
  nodeId: string;
  label: string;
  description?: string;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const isSelected = nodeId === selectedNodeId;

  return (
    <button
      type="button"
      className={[
        'min-h-10 rounded px-2 py-1.5 text-left text-sm transition',
        isSelected
          ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]'
          : 'hover:bg-[var(--app-panel-strong)]',
      ].join(' ')}
      onClick={() => onSelectNode(nodeId)}
    >
      <span className="block truncate font-semibold">{label}</span>
      {description ? (
        <span className="mt-0.5 block truncate text-xs font-normal text-[var(--app-muted)]">
          {description}
        </span>
      ) : null}
    </button>
  );
}
