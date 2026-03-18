import Navbar from "@/app/components/Navbar";

const weekSchedule = [
  { day: "Mon", time: "9:00 AM", subject: "Mathematics", topic: "Quadratic Equations", status: "Completed" },
  { day: "Mon", time: "11:00 AM", subject: "Science", topic: "Newton's Laws", status: "Completed" },
  { day: "Tue", time: "9:00 AM", subject: "English", topic: "Essay Writing", status: "Upcoming" },
  { day: "Tue", time: "2:00 PM", subject: "Mathematics", topic: "Trigonometry", status: "Upcoming" },
  { day: "Wed", time: "10:00 AM", subject: "Science", topic: "Electricity Basics", status: "Upcoming" },
];

const tasks = [
  { subject: "Mathematics", title: "Quadratic Equations MCQ", due: "Mar 19", type: "MCQ", status: "Pending" },
  { subject: "Science", title: "Newton's Laws Quiz", due: "Mar 18", type: "MCQ", status: "Completed", score: "8/10" },
  { subject: "English", title: "Reading Comprehension", due: "Mar 21", type: "Task", status: "Pending" },
];

const announcements = [
  { title: "Annual Sports Day", date: "Mar 25", message: "Sports day will be held on March 25. Students should wear sports attire." },
  { title: "Parent-Teacher Meeting", date: "Mar 30", message: "PTM scheduled for March 30 from 10 AM – 1 PM." },
];

export default function StudentDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar role="Student" color="bg-orange-500" />

      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Hi, Aarav Singh 👋</h2>
          <p className="text-gray-500">Class 8A · Roll No. 01</p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">📅</div>
            <div className="text-2xl font-bold text-gray-800">3</div>
            <div className="text-gray-500 text-sm">Classes Today</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">📝</div>
            <div className="text-2xl font-bold text-gray-800">2</div>
            <div className="text-gray-500 text-sm">Pending Tasks</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-2xl font-bold text-gray-800">92%</div>
            <div className="text-gray-500 text-sm">Attendance</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">🏆</div>
            <div className="text-2xl font-bold text-gray-800">8.5</div>
            <div className="text-gray-500 text-sm">Avg Score /10</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Weekly Schedule */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">This Week&apos;s Classes</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {weekSchedule.map((c, i) => (
                <div key={i} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-semibold text-orange-500 w-8">{c.day}</div>
                    <div>
                      <div className="font-medium text-gray-800 text-sm">{c.subject}</div>
                      <div className="text-gray-500 text-xs">{c.time} · {c.topic}</div>
                    </div>
                  </div>
                  {c.status === "Completed" ? (
                    <button className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-2 py-1 rounded hover:bg-orange-100">
                      View Content
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Locked 🔒</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Tasks &amp; Assessments</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {tasks.map((t) => (
                <div key={t.title} className="px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-gray-800 text-sm">{t.title}</div>
                      <div className="text-gray-500 text-xs">{t.subject} · Due {t.due} · {t.type}</div>
                      {t.score && (
                        <div className="mt-1 text-green-600 text-xs font-medium">Score: {t.score}</div>
                      )}
                    </div>
                    {t.status === "Pending" ? (
                      <button className="text-xs bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600">
                        Start
                      </button>
                    ) : (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Done</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Raise Doubt */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Raise a Doubt</h3>
            </div>
            <div className="p-5 space-y-3">
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300">
                <option>Select Subject</option>
                <option>Mathematics</option>
                <option>Science</option>
                <option>English</option>
              </select>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300">
                <option>Select Topic</option>
                <option>Quadratic Equations</option>
                <option>Trigonometry</option>
              </select>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={3}
                placeholder="Describe your doubt..."
              />
              <button className="w-full bg-orange-500 text-white py-2 rounded-lg text-sm hover:bg-orange-600 transition-colors">
                Submit Doubt
              </button>
            </div>
          </div>

          {/* Announcements */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Announcements</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {announcements.map((a) => (
                <div key={a.title} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-800 text-sm">{a.title}</span>
                    <span className="text-xs text-gray-400">{a.date}</span>
                  </div>
                  <p className="text-gray-600 text-xs">{a.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
