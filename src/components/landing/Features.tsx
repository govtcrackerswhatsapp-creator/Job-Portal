import { Bell, BookOpen, FileText, Clock } from 'lucide-react';

const FEATURES = [
  { icon: Bell, title: 'Daily Job Updates', desc: 'Fresh government, corporate, and internship notifications added every day.', color: '#8b2df2' },
  { icon: FileText, title: 'Complete Exam Details', desc: 'Full exam patterns, syllabus, and selection process for every listing.', color: '#00b4d8' },
  { icon: BookOpen, title: 'Study Material', desc: 'Curated resources and preparation tips to help you succeed.', color: '#f43f5e' },
  { icon: Clock, title: 'Never Miss Deadlines', desc: 'Clear application windows so you always apply on time.', color: '#f59e0b' },
];

export default function Features() {
  return (
    <section className="max-w-5xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Why TecKosh</p>
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-zinc-900 mt-1">Everything you need to land your dream job</h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {FEATURES.map((f, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-soft hover:shadow-soft-hover transition p-6">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${f.color}15` }}>
              <f.icon className="w-6 h-6" style={{ color: f.color }} />
            </div>
            <h3 className="font-heading text-lg font-semibold text-zinc-900 mb-1">{f.title}</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}