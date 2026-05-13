import { useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { dbTables } from '../../api/api';
import type { LayoutOutletContext } from '../../app/layout';

type DbTableName = keyof typeof dbTables;

type HomeIconItem = {
  id: string;
  label: string;
  to: string;
  ariaLabel: string;
  iconText: string;
  iconClassName: string;
};

const HOME_ICON_COLORS = [
  'bg-sky-700',
  'bg-emerald-700',
  'bg-amber-600',
  'bg-rose-700',
  'bg-indigo-700',
  'bg-cyan-700',
  'bg-lime-700',
  'bg-fuchsia-700',
];

export function HomePage() {
  const { setPageChrome, setQuickAddAction } =
    useOutletContext<LayoutOutletContext>();
  const tableItems = (Object.entries(dbTables) as [
    DbTableName,
    { label: string },
  ][]).map(([tableName, tableConfig], index) => ({
    id: tableName,
    label: tableConfig.label,
    to: `/list-edit?table=${encodeURIComponent(tableName)}`,
    ariaLabel: `${tableConfig.label} 테이블 열기`,
    iconText: tableConfig.label.slice(0, 2),
    iconClassName: HOME_ICON_COLORS[index % HOME_ICON_COLORS.length],
  }));

  useEffect(() => {
    setPageChrome(null);
    setQuickAddAction(null);

    return () => {
      setPageChrome(null);
      setQuickAddAction(null);
    };
  }, [setPageChrome, setQuickAddAction]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <HomeIconGridSection title="Dark Princess 데이터" items={tableItems} />
    </div>
  );
}

function HomeIconGridSection({
  title,
  items,
}: {
  title: string;
  items: HomeIconItem[];
}) {
  return (
    <section className="space-y-3">
      <div className="border-b border-[var(--app-border)] pb-3">
        <h1 className="text-xl font-semibold text-[var(--app-text)]">
          {title}
        </h1>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(84px,100%),1fr))] gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(min(112px,100%),1fr))] sm:gap-x-5 sm:gap-y-7">
        {items.map((item) => (
          <HomeIconLink key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function HomeIconLink({ item }: { item: HomeIconItem }) {
  return (
    <Link
      to={item.to}
      title={item.label}
      aria-label={item.ariaLabel}
      className="group mx-auto flex w-[84px] max-w-full flex-col items-center gap-2 rounded-md p-1 text-center no-underline transition sm:w-[112px]"
    >
      <span
        aria-hidden="true"
        className={`flex h-[72px] w-[72px] max-w-full items-center justify-center rounded-md text-lg font-black text-white shadow-sm ring-1 ring-black/5 transition group-hover:-translate-y-0.5 group-hover:shadow-md sm:h-[92px] sm:w-[92px] sm:text-2xl ${item.iconClassName}`}
      >
        {item.iconText}
      </span>
      <span className="line-clamp-2 min-h-[2.1rem] w-full break-keep text-center text-[0.72rem] font-semibold leading-[1.05rem] text-[var(--app-text)] sm:text-[0.78rem] sm:leading-[1.1rem]">
        {item.label}
      </span>
    </Link>
  );
}
