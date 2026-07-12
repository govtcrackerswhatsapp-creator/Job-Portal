import PaymentSettings from '../components/PaymentSettings';

export default function Admin() {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Administration</p>
        <h1 className="font-heading text-3xl font-bold text-zinc-900">Admin Panel</h1>
      </div>
      <div className="bg-white rounded-2xl shadow-soft p-6">
        <PaymentSettings />
      </div>
    </div>
  );
}