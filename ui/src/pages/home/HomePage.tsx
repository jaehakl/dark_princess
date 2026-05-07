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
  'from-sky-500 to-blue-700',
  'from-emerald-500 to-teal-700',
  'from-amber-400 to-orange-600',
  'from-rose-500 to-pink-700',
  'from-indigo-500 to-violet-700',
  'from-cyan-500 to-slate-700',
  'from-lime-500 to-green-700',
  'from-fuchsia-500 to-purple-700',
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
    <div className="mx-auto max-w-6xl space-y-7">
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
      <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-5 shadow-sm">
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
        className={`flex h-[72px] w-[72px] max-w-full items-center justify-center rounded-[20px] bg-gradient-to-br text-lg font-black text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] ring-1 ring-white/70 transition group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_28px_rgba(15,23,42,0.2)] sm:h-[92px] sm:w-[92px] sm:rounded-[24px] sm:text-2xl ${item.iconClassName}`}
      >
        {item.iconText}
      </span>
      <span className="line-clamp-2 min-h-[2.1rem] w-full break-keep text-center text-[0.72rem] font-semibold leading-[1.05rem] text-[var(--app-text)] sm:text-[0.78rem] sm:leading-[1.1rem]">
        {item.label}
      </span>
    </Link>
  );
}
