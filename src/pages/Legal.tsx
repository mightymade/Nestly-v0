import { ChevronLeft } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/ui';
import { testPayments } from '../services/supabase';

/** Where people write to about privacy, data or the terms. Change it here once Nestly has a real inbox. */
export const CONTACT_EMAIL = 'support@nestly.app';
const UPDATED = '14 November 2026';

type Sec = { id: string; title: string; body: ReactNode };
function LegalPage({ title, intro, sections, other }: { title: string; intro: ReactNode; sections: Sec[]; other: { to: string; label: string } }) {
  const nav = useNavigate();
  useEffect(() => { document.title = `${title} · Nestly`; window.scrollTo(0, 0); return () => { document.title = 'Nestly'; }; }, [title]);
  return <div className="legal">
    <header className="legal-top">
      <button type="button" className="round-btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back"><ChevronLeft size={20} /></button>
      <Link to="/" aria-label="Nestly home"><Logo /></Link>
      <Link to={other.to} className="small strong">{other.label}</Link>
    </header>
    <main className="legal-main">
      <h1>{title}</h1>
      <p className="muted small">Last updated {UPDATED}</p>
      <div className="legal-intro">{intro}</div>
      <nav className="legal-toc" aria-label="On this page"><b className="tiny muted">ON THIS PAGE</b>
        <ol>{sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ol></nav>
      {sections.map((s, i) => <section key={s.id} id={s.id} className="legal-sec"><h2>{i + 1}. {s.title}</h2>{s.body}</section>)}
      <p className="legal-foot small muted">Questions? Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </main>
  </div>;
}

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

/** Nestly's privacy policy, written for Uganda's Data Protection and Privacy Act, 2019 and its 2021 Regulations. */
export function PrivacyPage() {
  return <LegalPage title="Privacy policy" other={{ to: '/terms', label: 'Terms of use' }}
    intro={<><p>Nestly helps students find and book hostels near their university, and helps hostel owners and custodians run them. To do that we need some personal information. This page says what we collect, why, who sees it, how long we keep it, and your rights.</p>
      <p>We follow Uganda's <b>Data Protection and Privacy Act, 2019</b> and the <b>Data Protection and Privacy Regulations, 2021</b>. Nestly is a student project at Uganda Christian University{testPayments ? ' and is still in test mode' : ''}.</p></>}
    sections={[
      { id: 'who', title: 'Who we are', body: <p>Nestly is run by a group of students at Uganda Christian University, Mukono, as part of their studies. For anything about your data, write to {mail}.</p> },
      { id: 'collect', title: 'What we collect', body: <>
        <p><b>Students:</b> your name, student email, university, phone number, an optional profile photo, the hostels you save, your bookings and payment references, your reviews, and any reports you send.</p>
        <p><b>Hostel owners:</b> your name, email and phone number, your national ID and a selfie (to check who you are), proof that you own or run the hostel, the mobile money or bank account students pay into, your listings and photos, and your subscription payments.</p>
        <p><b>Custodians:</b> your name, username, and the phone number or email on your invite.</p>
        <p><b>Visitors at a hostel gate:</b> your name, phone number, who you came to see and the times you came and left.</p>
        <p><b>Payments:</b> the phone number you pay with and the reference Flutterwave gives us. Your mobile money PIN never reaches Nestly; you enter it on your own phone.</p>
        <p><b>Technical:</b> your login session is kept in your browser. When you open a map, the map and route services receive your internet address, as any website does.</p></> },
      { id: 'why', title: 'Why we use it', body: <ul>
        <li>To create your account and confirm that students really study at their university (the student email check).</li>
        <li>To let you book a room, take the booking fee, and tell the owner and custodian you are coming.</li>
        <li>To check owners' identity and ownership before their hostels appear on Nestly, so students are not cheated.</li>
        <li>To keep a visitor log at the gate for the safety of the people who live there.</li>
        <li>To send you messages about your account and bookings (confirm your email, reset your password, booking updates). We do not send advertising.</li>
        <li>To look into reports and keep Nestly safe and fair.</li></ul> },
      { id: 'consent', title: 'Your consent', body: <p>We ask for your agreement when you create an account or sign in at a gate. You can withdraw it at any time by asking us to delete your account (see section 7). Some things, like records of payments, we may have to keep for a while even after that, as section 6 explains.</p> },
      { id: 'share', title: 'Who sees your information', body: <>
        <ul>
          <li><b>The hostel you book</b>: the owner and custodian see your name, phone number and booking, so they can give you a room.</li>
          <li><b>Custodians</b> see the students and visitors at their own hostel only.</li>
          <li><b>Owners' ID documents</b> are seen only by the Nestly team that checks them. They are kept in private storage, and links to them expire after a few hours.</li>
          <li><b>Everyone</b> can see hostel listings, and reviews with the reviewer's first name and initial.</li>
          <li><b>Services that run Nestly for us</b>: Supabase (database, logins and file storage), Vercel (the website), Flutterwave (mobile money payments), our email provider (account emails), and OpenStreetMap services (maps and walking routes). They use your information only to provide their service.</li></ul>
        <p>We never sell your information or share it for advertising.</p></> },
      { id: 'keep', title: 'Where it is kept, and for how long', body: <>
        <p>Nestly's database and files are stored by Supabase in the European Union (Paris, France). The Act allows data to be kept outside Uganda with your consent or where the country protects it at least as well as Uganda does; by using Nestly you agree to this.</p>
        <ul>
          <li><b>Accounts</b> are kept while you use Nestly, and deleted when you ask.</li>
          <li><b>Visitor logs</b> are deleted automatically after 90 days.</li>
          <li><b>Bookings and payment records</b> are kept for as long as the law requires for financial records, then deleted.</li>
          <li><b>Owner ID documents</b> are kept while the owner has hostels on Nestly, and deleted when they leave.</li></ul></> },
      { id: 'rights', title: 'Your rights', body: <>
        <p>Under the Data Protection and Privacy Act, you can:</p>
        <ul><li>ask what information we hold about you, and get a copy;</li><li>ask us to correct anything wrong or out of date (you can change your name, phone and photo yourself in Settings);</li>
          <li>ask us to delete your information, or to stop using it;</li><li>complain to the Personal Data Protection Office (PDPO) of Uganda if you think we have misused your information.</li></ul>
        <p>Write to {mail} from the email on your account. We answer within 30 days.</p></> },
      { id: 'security', title: 'How we protect it', body: <ul>
        <li>Every table in the database has access rules: each person can only read and change what their role allows, and the server checks this on every request.</li>
        <li>Passwords are stored only as secure hashes. Nobody at Nestly can see them.</li>
        <li>Payments are confirmed with Flutterwave by our server. The browser can never mark anything as paid.</li>
        <li>If your information is ever accessed by someone who should not have it, we will tell the PDPO straight away, as the law requires, and tell you when the PDPO says we should.</li></ul> },
      { id: 'children', title: 'Children', body: <p>Nestly is for university students and hostel staff, who are adults. If you are under 18, ask a parent or guardian to help you, and do not create an account without their consent.</p> },
      { id: 'changes', title: 'Changes to this policy', body: <p>If we change this policy, we update the date at the top and, for important changes, tell you in the app or by email before they apply.</p> },
    ]} />;
}

/** Nestly's terms of use for students, hostel owners, custodians and visitors. */
export function TermsPage() {
  return <LegalPage title="Terms of use" other={{ to: '/privacy', label: 'Privacy policy' }}
    intro={<><p>These terms are the agreement between you and Nestly when you use the website or app. By creating an account, booking a room, listing a hostel or signing in at a gate, you agree to them. Please read them, especially sections 3 and 4 about money.</p>
      {testPayments && <p><b>Test mode:</b> Nestly is a student project at Uganda Christian University. While in test mode, payments are not real and no money moves.</p>}</>}
    sections={[
      { id: 'what', title: 'What Nestly is', body: <p>Nestly lists hostels near universities and lets students book a room by paying a booking fee. Nestly is not the landlord. The agreement to rent a room is between the student and the hostel owner, and the owner is responsible for the room, its condition and its rules.</p> },
      { id: 'accounts', title: 'Your account', body: <ul>
        <li>Give true details. Students must use their own student email from their university.</li>
        <li>Keep your password secret. You are responsible for what is done with your account.</li>
        <li>One account per person. Do not sign up for someone else.</li>
        <li>We may pause an account that breaks these terms, after looking into it. You can ask us why.</li></ul> },
      { id: 'booking', title: 'Booking a room (students)', body: <ul>
        <li>The <b>booking fee</b> shown on the hostel page holds your room for the semester shown. It is paid by mobile money and goes to the hostel owner.</li>
        <li>You can <b>cancel for free within 48 hours</b> of booking. The owner then returns your booking fee to the number you paid with. After 48 hours, the owner's own cancellation rules apply.</li>
        <li><b>Rent</b> is paid to the owner, not through Nestly, and is agreed between you and the owner. Your booking fee counts toward it, so at check-in you pay the rent less the booking fee. You can check in once the hostel has received that balance.</li>
        <li>You may hold one booking per semester.</li>
        <li>If a hostel is not as listed, or a payment goes wrong, report it on the hostel page. We look into every report.</li></ul> },
      { id: 'owners', title: 'Listing a hostel (owners)', body: <ul>
        <li>You must own or have the right to rent out the hostel, and prove it with the documents we ask for. Hostels appear on Nestly only after we check them.</li>
        <li>Your listing, photos, prices and room counts must be true and kept up to date. Changing the name, photos or location sends the listing back to us for checking.</li>
        <li>Students' booking fees go to the account you give us. You must honour bookings, and return booking fees for cancellations made within 48 hours.</li>
        <li>Nestly charges owners a <b>monthly subscription</b> for each hostel on Nestly, at the price shown in your Money page. It starts when your first hostel goes live. If it is not paid after the grace period, your hostels can be paused until you pay. Bookings already made stay valid.</li>
        <li>Nestly takes no commission on booking fees or rent.</li>
        <li>You are responsible for your custodians' use of Nestly. Remove a custodian as soon as they stop working for you.</li></ul> },
      { id: 'staff', title: 'Custodians and visitors', body: <ul>
        <li>Custodians may use Nestly only for the hostel that invited them, and only to manage rooms, check students in and out, and log visitors.</li>
        <li>Visitors who sign in at a gate agree that the hostel keeps their name, phone number and visit times for security. The hostel's visiting hours and rules apply.</li></ul> },
      { id: 'reviews', title: 'Reviews and reports', body: <ul>
        <li>Only students who stayed at a hostel can review it. Reviews must be honest and about your own stay.</li>
        <li>No insults, threats, hate, personal information about others, or false claims. We may hide reviews that break these rules.</li>
        <li>Owners may reply once, publicly and politely, and may report reviews they believe break these rules.</li></ul> },
      { id: 'not-allowed', title: 'Things you must not do', body: <ul>
        <li>List a hostel you do not have the right to rent out, or ask students to pay outside Nestly to avoid a booking.</li>
        <li>Charge students more than the prices on your listing.</li>
        <li>Use someone else's account or student email.</li>
        <li>Try to break, overload or get around Nestly's security, or collect other people's information.</li></ul> },
      { id: 'liability', title: 'Our responsibility', body: <p>We work hard to check owners and listings, but we cannot visit every hostel or guarantee everything an owner says. As far as the law allows, Nestly is not responsible for the condition of a hostel, for disputes between students and owners about rent or rooms, or for losses caused by a service we depend on being unavailable. Nothing in these terms takes away rights you have under Ugandan law.</p> },
      { id: 'law', title: 'Changes, and the law that applies', body: <><p>We may update these terms. We change the date at the top, and tell you about important changes before they apply. If you keep using Nestly after that, you accept the new terms.</p>
        <p>These terms are governed by the laws of Uganda. If we cannot settle a disagreement by talking, it goes to the courts of Uganda.</p></> },
    ]} />;
}
