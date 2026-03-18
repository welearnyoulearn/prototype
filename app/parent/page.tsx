import Navbar from "@/app/components/Navbar";

const weekSchedule = [
  { day: "Mon", subject: "Mathematics", topic: "Quadratic Equations", time: "9:00 AM", completed: true },
  { day: "Mon", subject: "Science", topic: "Newton's Laws", time: "11:00 AM", completed: true },
  { day: "Tue", subject: "English", topic: "Essay Writing", time: "9:00 AM", completed: false },
  { day: "Tue", subject: "Mathematics", topic: "Trigonometry", time: "2:00 PM", completed: false },
  { day: "Wed", subject: "Science", topic: "Electricity Basics", time: "10:00 AM", completed: false },
];

const attendance = [
  { month: "January", present: 22, total: 24 },
  { month: "February", present: 19, total: 20 },
  { month: "March", present: 12, total: 13 },
];

const tasks = [
  { subject: "Mathematics", title: "Quadratic Equations MCQ", due: "Mar 19", status: "Pending" },
  { subject: "Science", title: "Newton's Laws Quiz", due: "Mar 18", status: "Completed", score: "8/10" },
];

const announcements = [
  { title: "Annual Sports Day", date: "Mar 25", message: "Sports day on March 25. Students should wear sports attire." },
  { title: "Parent-Teacher Meeting", date: "Mar 30", message: "PTM scheduled for March 30 from 10 AM – 1 PM." },
];

export default function ParentDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar role="Parent" color="bg-teal-600" />

      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Aarav Singh&apos;s Overview</h2>
            <p className="text-gray-500">Class 8A · Sunrise Academy</p>
          </div>
          <button className="bg-teal-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-teal-700">
            + Request Leave
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-2xl font-bold text-gray-800">92%</div>
            <div className="text-gray-500 text-sm">Attendance</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">📝</div>
            <div className="text-2xl font-bold text-gray-800">1</div>
            <div className="text-gray-500 text-sm">Pending Tasks</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">🏆</div>
            <div className="text-2xl font-bold text-gray-800">8.5</div>
            <div className="text-gray-500 text-sm">Avg Score /10</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">📢</div>
            <div className="text-2xl font-bold text-gray-800">2</div>
            <div className="text-gray-500 text-sm">Announcements</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Weekly Timetable */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">This Week&apos;s Schedule</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {weekSchedule.map((c, i) => (
                <div key={i} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-semibold text-teal-600 w-8">{c.day}</div>
                    <div>
                      <div className="font-medium text-gray-800 text-sm">{c.subject}</div>
                      <div className="text-gray-500 text-xs">{c.time} · {c.topic}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    c.completed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {c.completed ? "Done" : "Upcoming"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Attendance */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Attendance Report</h3>
            </div>
            <div className="p-5 space-y-4">
              {attendance.map((a) => {
                const pct = Math.round((a.present / a.total) * 100);
                return (
                  <div key={a.month}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{a.month}</span>
                      <span className="text-gray-500">{a.present}/{a.total} days ({pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-teal-500 h-2 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Tasks &amp; Results</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {tasks.map((t) => (
                <div key={t.title} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-800 text-sm">{t.title}</div>
                    <div className="text-gray-500 text-xs">{t.subject} · Due {t.due}</div>
                    {t.score && (
                      <div className="mt-0.5 text-green-600 text-xs font-medium">Score: {t.score}</div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    t.status === "Completed" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                  }`}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Announcements */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">School Announcements</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {announcements.map((a) => (
                <div key={a.title} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-800 text-sm">{a.title}</span>
                    <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">{a.date}</span>
                  </div>
                  <p className="text-gray-600 text-xs">{a.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Leave Request Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mt-6">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Request Leave for Aarav</h3>
          </div>
          <div className="p-5 grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">From Date</label>
              <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">To Date</label>
              <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Reason</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300">
                <option>Medical</option>
                <option>Family Function</option>
                <option>Travel</option>
                <option>Other</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <button className="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-teal-700 transition-colors">
                Submit Leave Request
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
