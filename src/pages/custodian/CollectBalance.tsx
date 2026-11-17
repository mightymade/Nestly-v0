import { Banknote } from 'lucide-react';
import { useState } from 'react';
import { Overlay } from '../../components/Overlay';
import { useToast } from '../../components/Toast';
import { Btn } from '../../components/ui';
import type { Tenant } from '../../data/types';
import { ugx } from '../../lib/format';
import { balanceDue, bookingOfTenant, recordRentPayment, rentTotal } from '../../services/api';

/** The custodian collects the balance (rent less the booking fee) before a student can be checked in. */
export function CollectBalance({ t, onClose }: { t: Tenant; onClose: () => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const b = bookingOfTenant(t); const first = t.name.split(' ')[0];
  if (!b) return null;
  async function received() {
    setBusy(true);
    try { await recordRentPayment(t.id); toast(`${first}'s balance is recorded. You can check them in now.`); onClose(); }
    catch (x) { toast((x as Error).message); setBusy(false); }
  }
  return <Overlay title={`Collect ${first}'s balance`} onClose={onClose} width={440}
    footer={<><Btn kind="secondary" className="grow" onClick={onClose}>Not yet</Btn><Btn className="grow" loading={busy} onClick={received}><Banknote size={16} />Balance received</Btn></>}>
    <div className="stack">
      <p>Collect the balance from <b className="ink">{t.name}</b> before you check them in. Rent goes to the owner, not through Nestly.</p>
      <div className="receipt">
        <div className="sum"><span className="muted">Rent for {b.sem}</span><span className="num">{ugx(rentTotal(b))}</span></div>
        <div className="sum"><span className="muted">Booking fee, already paid</span><span className="num">{ugx(b.fee)}</span></div>
        <div className="sum total"><span>Balance to collect</span><span className="num">{ugx(balanceDue(b))}</span></div>
      </div>
    </div></Overlay>;
}
