import { useDeferredValue, useMemo, useState } from 'react';
import { Search, PackagePlus, Boxes, ShieldAlert, Snowflake, IndianRupee } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Stat, Pills, fmtNum } from '../../components/ui';
import { StockTable, AddStockModal, stockLevel, isColdChain } from '../pharmacy/stock';

export default function Stock({ home, reload }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const inv = home.inventory;
  const watch = inv.filter((i) => stockLevel(i).key !== 'ok');
  // Deferred search + memoised list so the (memoised) stock table doesn't re-render on every keystroke.
  const dq = useDeferredValue(q);
  const items = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    return inv
      .filter((i) => (filter === 'watch' ? stockLevel(i).key !== 'ok' : filter === 'cold' ? isColdChain(i.drug) : true))
      .filter((i) => !needle || `${i.drug} ${i.batch || ''}`.toLowerCase().includes(needle))
      .sort((a, b) => a.drug.localeCompare(b.drug));
  }, [inv, filter, dq]);
  const units = inv.reduce((s, i) => s + i.qty, 0);

  return (
    <>
      <PageHeader eyebrow={home.warehouse?.district ? `${home.warehouse.district} · ${home.warehouse.state}` : undefined} title="Warehouse stock" subtitle="Safety stock is the line the supply engine never crosses when it pulls from you for another district.">
        <Button icon={PackagePlus} onClick={() => setAdding(true)}>Receive stock (GRN)</Button>
      </PageHeader>

      <div className="grid four mb-2">
        <Stat label="SKUs in warehouse" icon={Boxes} value={inv.length} />
        <Stat label="Units on hand" value={fmtNum(units)} />
        <Stat label="Near safety stock" icon={ShieldAlert} value={watch.length} sub={watch.length ? 'Plan a bulk order' : 'Comfortable'} />
        <Stat label="Cold-chain SKUs" icon={Snowflake} value={inv.filter((i) => isColdChain(i.drug)).length} sub="Stored at 2–8°C" />
      </div>

      <div className="row wrap between mb-2" style={{ gap: 12 }}>
        <div className="input-wrap" style={{ width: 300, maxWidth: '100%' }}>
          <Search />
          <input className="input" placeholder="Search SKU or batch" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Pills value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All' },
          { value: 'watch', label: `Needs attention (${watch.length})` },
          { value: 'cold', label: 'Cold chain' },
        ]} />
      </div>

      <StockTable items={items} onSaved={reload} showSafety unit="units (strips, sachets, kits)" />
      <p className="tiny muted mt-2 row" style={{ gap: 6 }}><IndianRupee size={12} /> Valuation and GRN history sync from your ERP in the full version.</p>

      <AddStockModal open={adding} onClose={() => setAdding(false)} onAdded={reload} defaultSafety={200} title="Receive stock (GRN)" />
    </>
  );
}
