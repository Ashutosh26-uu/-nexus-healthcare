import { useDeferredValue, useMemo, useState } from 'react';
import { Search, PackagePlus, ScanBarcode, Boxes, AlertTriangle, CalendarX } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Pills, Stat, fmtNum } from '../../components/ui';
import { StockTable, AddStockModal, BarcodeModal, expiryInfo } from './stock';
import Advisory from './Advisory';

export default function Inventory({ home, reload }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Typing stays instant on a big shelf: the table filters on a deferred copy of the search, and
  // the list is only rebuilt when the stock, filter or search actually change.
  const dq = useDeferredValue(q);
  const items = useMemo(() => {
    const lowIds = new Set(home.lowStock.map((i) => i.id));
    const expIds = new Set(home.expiring.map((i) => i.id));
    const needle = dq.trim().toLowerCase();
    return home.inventory
      .filter((i) => (filter === 'low' ? lowIds.has(i.id) : filter === 'expiring' ? expIds.has(i.id) : true))
      .filter((i) => !needle || `${i.drug} ${i.batch}`.toLowerCase().includes(needle))
      .sort((a, b) => (filter === 'expiring' ? new Date(a.expiry) - new Date(b.expiry) : a.drug.localeCompare(b.drug)));
  }, [home.inventory, home.lowStock, home.expiring, filter, dq]);

  const units = home.inventory.reduce((s, i) => s + i.qty, 0);

  return (
    <>
      <PageHeader title="Inventory" subtitle="Your live shelf. Doctors see “in stock nearby” from these numbers, so a quick correction saves a wasted trip for a patient.">
        <Button variant="secondary" icon={ScanBarcode} onClick={() => setScanning(true)}>Scan barcode</Button>
        <Button icon={PackagePlus} onClick={() => setAdding(true)}>Add stock</Button>
      </PageHeader>

      <Advisory advisories={home.advisories} />

      <div className="grid three mb-2">
        <Stat label="Medicines on shelf" icon={Boxes} value={home.inventory.length} sub={`${fmtNum(units)} units in total`} />
        <Stat label="Below safety stock" icon={AlertTriangle} value={home.lowStock.length} sub={home.lowStock.length ? 'Reorder from Stock alerts' : 'All good'} />
        <Stat label="Expiring in 60 days" icon={CalendarX} value={home.expiring.length} sub={home.expiring.filter((i) => expiryInfo(i.expiry).days <= 30).length + ' within 30 days'} />
      </div>

      <div className="row wrap between mb-2" style={{ gap: 12 }}>
        <div className="input-wrap ph-search">
          <Search />
          <input className="input" placeholder="Search medicine or batch" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Pills value={filter} onChange={setFilter} options={[
          { value: 'all', label: `All (${home.inventory.length})` },
          { value: 'low', label: `Low stock (${home.lowStock.length})` },
          { value: 'expiring', label: `Expiring (${home.expiring.length})` },
        ]} />
      </div>

      <StockTable items={items} onSaved={reload} unit="strips / units" />

      <AddStockModal open={adding} onClose={() => setAdding(false)} onAdded={reload} />
      <BarcodeModal open={scanning} onClose={() => setScanning(false)} onManual={() => setAdding(true)} />
    </>
  );
}
