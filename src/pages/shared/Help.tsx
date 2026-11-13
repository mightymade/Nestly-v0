import { ChevronDown, LifeBuoy, Mail } from 'lucide-react';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { BackBar } from '../../components/ui';
import { useIsPhone } from '../../lib/useIsPhone';
import { useUser } from '../../services/session';
import { subConfig } from '../../services/api';
import { ugx } from '../../lib/format';

const faq = (): Record<string, string[][]> => { const c = subConfig(); return {
  student: [
    ['How do I know a hostel is real?', 'Hostels with the Verified badge have an owner whose ID and ownership papers the Nestly team has checked. Only book hostels you can see on Nestly.'],
    ['What is the booking fee?', 'A small fee you pay now to hold the room. It goes straight to the hostel owner, not to Nestly. Rent is paid to the owner later. If you cancel within 48 hours, the owner sends the whole fee back to your mobile money.'],
    ['Why do I need my student email?', 'Nestly is only for students. Confirming your university email proves that you study there. We ask you to confirm again each academic year.'],
    ['Something in my room is broken. What do I do?', 'Call your custodian. Their number is on the My Hostel tab, one tap away.'],
    ['I paid but the hostel says it got nothing. What now?', 'Open the hostel on Nestly, choose Report a problem, then Payment not received, and say when and how you paid. The Nestly team contacts the owner and follows it up with you.'],
    ['Can I change my booking?', 'You can hold one booking per semester. Cancel your current one first, then book the new room.'],
  ],
  custodian: [
    ['How do visitors sign in?', 'Print the gate QR code from Today or Visitors. Visitors scan it with their phone camera. For visitors without a smartphone, use Log visitor.'],
    ['Can I edit the visitor log?', 'No. Nobody can edit or delete entries, which keeps the log reliable if something goes wrong.'],
    ['Why can I not change prices?', 'Prices, room types and rooms are set by the hostel owner. You give students a room and mark rooms ready or not available.'],
    ['How do I give a student a room?', 'Open Rooms. Students waiting for a room are listed at the top. Choose one and pick a free bed of the room type they booked.'],
    ['How do I check a tenant in?', 'Give them a room first, then open Tenants, find them under Arriving and choose Check in once you have handed over the key.'],
    ['How do tenants see my notices?', 'Notices you send from the Notices tab appear in every tenant’s My Hostel tab and as a notification.'],
  ],
  owner: [
    ['When does my hostel go live?', 'After the Nestly team checks your ID and your proof of ownership. Most checks take 1 to 2 working days.'],
    ['How do I get paid?', 'Students pay the booking fee straight into the mobile money number or bank account in Settings. Nestly never holds your money. Rent is paid to you at check-in.'],
    ['What does Nestly cost?', `A monthly subscription of ${ugx(c.subFee)} ${c.perHostel ? 'for each hostel you list' : 'for all your hostels'}. You pay it on the Money page with mobile money. There is no commission on bookings.`],
    ['What if I pay my subscription late?', `You have ${c.graceDays} days after the due date. After that the Nestly team can pause your hostels so students cannot find them. They come back as soon as you pay. Bookings already made stay valid.`],
    ['How do I add a custodian?', 'Open Staff and choose Invite. Share the code with them. They enter it on the Nestly welcome page to set up their account.'],
    ['Why did my listing go back to review?', 'Changing the name, photos or map pin of a live hostel needs a fresh check, so students always see what is real. Prices and rooms can change without a review.'],
  ],
  admin: [
    ['What should I check on an owner?', 'The name on the ID matches the account, the selfie matches the ID photo, and the payment account is in the same name.'],
    ['What should I check on a listing?', 'The proof of ownership names the owner, the photos look like a real hostel, and the map pin is near the university.'],
    ['What does pausing do?', 'A paused hostel disappears from Explore. Existing bookings stay valid. A paused person cannot log in.'],
    ['When should I pause an owner for not paying?', `Only after the ${c.graceDays}-day grace period, and after a reminder. Their hostels come back by themselves when they pay.`],
    ['Can Nestly refund a student?', 'No. Booking fees go straight to the owner. For a payment problem, contact the owner, then close the report with what happened.'],
  ],
}; };

export function HelpPage() {
  const u = useUser(); const role = u?.role ?? 'student'; const phone = useIsPhone();
  const body = <>
    <Card title="Common questions" fill={!phone} scroll={!phone}>{faq()[role].map(([q, a]) => <details key={q} className="faq"><summary>{q}<ChevronDown size={18} className="ic" /></summary><p>{a}</p></details>)}</Card>
    <Card><div className="row start"><span className="icon-tile primary"><LifeBuoy size={20} /></span><div className="grow stack-sm"><h2>Still need help?</h2>
      <p className="muted">Email the Nestly team. We reply within one working day.</p>
      <p className="row-sm strong" style={{ userSelect: 'all' }}><Mail size={16} />support@nestly.app</p></div></div></Card>
  </>;
  if (phone) return <><BackBar title="Help" to={!u ? '/s/explore' : { student: '/s/account', custodian: '/c/settings', owner: '/o/settings', admin: '/a/settings' }[role]} /><main className="m-main pushed">{body}</main></>;
  return <><PageHeader title="Help" /><div className="fill-col fill">{body}</div></>;
}
