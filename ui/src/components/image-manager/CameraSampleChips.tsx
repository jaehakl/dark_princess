import { useMemo, useState } from 'react';
import type { CameraSamples } from '../../api/type';
import { cx } from '../ui';

type CameraSampleChipsProps = {
  cameraSamples: CameraSamples;
  onSelectSample: (sample: string) => void;
};

export function CameraSampleChips({
  cameraSamples,
  onSelectSample,
}: CameraSampleChipsProps) {
  const groups = useMemo(
    () =>
      Object.entries(cameraSamples)
        .map(([key, samplesByTag]) => ({
          key,
          samples: Object.entries(samplesByTag)
            .map(([tag, description]) => ({
              tag: tag.trim(),
              description: description.trim(),
            }))
            .filter((sample) => sample.tag.length > 0),
        }))
        .filter((group) => group.samples.length > 0),
    [cameraSamples],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activeGroup = groups.find((group) => group.key === selectedKey) ?? groups[0] ?? null;

  if (!groups.length || !activeGroup) {
    return null;
  }

  return (
    <div className="space-y-2 border-t border-[rgba(255,208,222,0.18)] pt-3">
      <div className="flex flex-wrap gap-1.5">
        {groups.map((group) => {
          const isActive = group.key === activeGroup.key;
          return (
            <button
              key={group.key}
              type="button"
              className={cx(
                'border font-bold transition-[border-color,filter]',
                isActive
                  ? 'shadow-[0_0_0_2px_rgba(244,191,103,0.18)]'
                  : 'hover:brightness-95',
              )}
              style={{
                backgroundColor: '#ffffff',
                borderColor: isActive ? '#ffe2ba' : 'rgba(255,255,255,0.72)',
                borderRadius: '9999px',
                color: isActive ? '#2c1428' : '#5b4055',
                fontSize: '10pt',
                lineHeight: '16px',
                padding: '2px 10px',
              }}
              onClick={() => setSelectedKey(group.key)}
              aria-pressed={isActive}
            >
              {group.key}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {activeGroup.samples.map((sample) => (
          <button
            key={`${activeGroup.key}:${sample.tag}`}
            type="button"
            className="border font-semibold transition-[border-color,filter] hover:brightness-105"
            style={{
              backgroundColor: '#ffd7e4',
              borderColor: '#ffb8cf',
              borderRadius: '9999px',
              color: '#4a1730',
              fontSize: '10pt',
              lineHeight: '16px',
              padding: '2px 10px',
            }}
            title={sample.description || sample.tag}
            aria-label={`${sample.tag}: ${sample.description || sample.tag}`}
            onClick={() => onSelectSample(sample.tag)}
          >
            {sample.tag}
          </button>
        ))}
      </div>
    </div>
  );
}
